import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

/**
 * Regras do Storage — o arquivo que tinha ficado para trás.
 *
 * Enquanto o Firestore migrou para subcoleções por barbearia, o Storage ainda
 * usava caminhos GLOBAIS e o claim aposentado `role == 'owner'`. Consequência:
 * qualquer dono com o claim antigo leria os relatórios de TODAS as barbearias,
 * e um dono novo não conseguiria escrever nada.
 *
 * Não era explorável porque nenhuma tela fazia upload — e é exatamente por isso
 * que nunca apareceu. Logo e fotos do salão são o próximo item da lista.
 */

const ALFA = "barbearia-alfa";
const BETA = "barbearia-beta";

const DONO_ALFA = { sub: "dono-alfa", barbershops: { [ALFA]: "owner" } };
const DONO_BETA = { sub: "dono-beta", barbershops: { [BETA]: "owner" } };
const BARBEIRO_ALFA = { sub: "barbeiro-alfa", barbershops: { [ALFA]: "staff" } };
const CLIENTE = { sub: "cliente-1" };
/** O claim single-tenant que sobreviveu no arquivo antigo. */
const DONO_LEGADO = { sub: "dono-legado", role: "owner" };

let testEnv: RulesTestEnvironment;

function as(claims: { sub: string } & Record<string, unknown>) {
  const { sub, ...rest } = claims;
  return testEnv.authenticatedContext(sub, rest).storage();
}
const anon = () => testEnv.unauthenticatedContext().storage();

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const imagem = { contentType: "image/png" };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "regras-storage",
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync(resolve(__dirname, "../../../storage.rules"), "utf8"),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.storage();
    for (const bid of [ALFA, BETA]) {
      await uploadBytes(ref(s, `barbershops/${bid}/brand/logo.png`), PNG, imagem);
      await uploadBytes(ref(s, `barbershops/${bid}/reports/fechamento-julho.pdf`), PNG);
    }
    await uploadBytes(ref(s, `users/${CLIENTE.sub}/avatar/foto.png`), PNG, imagem);
  });
});

afterAll(async () => testEnv?.cleanup());

describe("isolamento entre barbearias no Storage", () => {
  it("🔒 o dono da Alfa NÃO lê o fechamento da Beta", async () => {
    await assertFails(getBytes(ref(as(DONO_ALFA), `barbershops/${BETA}/reports/fechamento-julho.pdf`)));
  });

  it("o dono lê o próprio fechamento", async () => {
    await assertSucceeds(
      getBytes(ref(as(DONO_ALFA), `barbershops/${ALFA}/reports/fechamento-julho.pdf`))
    );
  });

  it("🔒 nem o dono escreve relatório — quem gera é o servidor", async () => {
    await assertFails(
      uploadBytes(ref(as(DONO_ALFA), `barbershops/${ALFA}/reports/forjado.pdf`), PNG)
    );
  });

  it("🔒 o barbeiro NÃO lê o fechamento financeiro", async () => {
    await assertFails(
      getBytes(ref(as(BARBEIRO_ALFA), `barbershops/${ALFA}/reports/fechamento-julho.pdf`))
    );
  });

  it("🔒 o dono da Alfa NÃO publica na marca da Beta", async () => {
    await assertFails(
      uploadBytes(ref(as(DONO_ALFA), `barbershops/${BETA}/brand/logo.png`), PNG, imagem)
    );
  });

  it("o dono publica a própria marca e as próprias fotos", async () => {
    await assertSucceeds(
      uploadBytes(ref(as(DONO_ALFA), `barbershops/${ALFA}/brand/logo.png`), PNG, imagem)
    );
    await assertSucceeds(
      uploadBytes(ref(as(DONO_ALFA), `barbershops/${ALFA}/photos/salao.png`), PNG, imagem)
    );
  });

  it("🔒 o claim single-tenant antigo não vale mais nada", async () => {
    // Era ele que dava acesso global no arquivo anterior.
    await assertFails(
      getBytes(ref(as(DONO_LEGADO), `barbershops/${ALFA}/reports/fechamento-julho.pdf`))
    );
    await assertFails(
      uploadBytes(ref(as(DONO_LEGADO), `barbershops/${ALFA}/brand/logo.png`), PNG, imagem)
    );
  });

  it("🔒 cliente não publica nada na barbearia", async () => {
    await assertFails(
      uploadBytes(ref(as(CLIENTE), `barbershops/${ALFA}/brand/logo.png`), PNG, imagem)
    );
  });
});

describe("vitrine é pública, financeiro não", () => {
  it("a logo é legível sem login — ela aparece na tela de entrada", async () => {
    await assertSucceeds(getBytes(ref(anon(), `barbershops/${ALFA}/brand/logo.png`)));
  });

  it("🔒 o fechamento NÃO é legível sem login", async () => {
    await assertFails(getBytes(ref(anon(), `barbershops/${ALFA}/reports/fechamento-julho.pdf`)));
  });
});

describe("foto de perfil", () => {
  it("cada um lê e troca a sua", async () => {
    await assertSucceeds(getBytes(ref(as(CLIENTE), `users/${CLIENTE.sub}/avatar/foto.png`)));
    await assertSucceeds(
      uploadBytes(ref(as(CLIENTE), `users/${CLIENTE.sub}/avatar/foto.png`), PNG, imagem)
    );
  });

  it("🔒 ninguém lê a foto de outra pessoa sabendo o uid", async () => {
    // Antes era "qualquer um logado", o que valia entre barbearias diferentes.
    await assertFails(getBytes(ref(as(DONO_BETA), `users/${CLIENTE.sub}/avatar/foto.png`)));
  });
});

describe("negar por padrão", () => {
  it("🔒 caminho fora do modelo é inacessível", async () => {
    await assertFails(getBytes(ref(as(DONO_ALFA), "products/qualquer/foto.png")));
    await assertFails(uploadBytes(ref(as(DONO_ALFA), "reports/qualquer.pdf"), PNG));
  });

  it("🔒 arquivo que não é imagem não sobe para a vitrine", async () => {
    await assertFails(
      uploadBytes(ref(as(DONO_ALFA), `barbershops/${ALFA}/brand/script.js`), PNG, {
        contentType: "application/javascript",
      })
    );
  });
});
