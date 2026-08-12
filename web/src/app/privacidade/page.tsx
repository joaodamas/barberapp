import type { Metadata } from "next";
import { AConfirmar, DocumentoLegal, Secao } from "@/components/legal/documento";
import { getTenant, isPlatformRoot } from "@/lib/tenant-server";

export const metadata: Metadata = {
  title: "Política de Privacidade — CorteHub",
  description:
    "Como o CorteHub trata dados pessoais: quem é responsável por quê, onde os dados ficam e como exercer seus direitos.",
};

/**
 * Política de privacidade.
 *
 * Duas decisões que explicam o formato:
 *
 * 1. **A página sabe em que barbearia está.** Num subdomínio de barbearia, o
 *    controlador do dado do cliente final é AQUELA barbearia, com nome. Um
 *    documento genérico obrigaria o cliente a descobrir sozinho a quem
 *    reclamar — que é justamente o direito que a LGPD lhe dá.
 * 2. **O que não se sabe aparece marcado**, e não preenchido com texto
 *    plausível. Ver `AConfirmar`.
 *
 * ⚠️ Redigido a partir do que o código faz, não de modelo. Precisa de revisão
 * jurídica antes de ir ao ar: aqui se descreve o tratamento com precisão
 * técnica, não se atesta conformidade.
 */
export default async function PrivacidadePage() {
  const naRaiz = await isPlatformRoot();
  const tenant = await getTenant();
  const barbearia = naRaiz ? null : tenant.brand.name;

  return (
    <DocumentoLegal
      titulo="Política de Privacidade"
      atualizadoEm="12 de agosto de 2026"
      resumo="O CorteHub é a ferramenta que a barbearia usa para gerenciar a agenda dela. Quem decide guardar seus dados é a barbearia; nós só operamos o sistema por conta dela. Esta página diz exatamente quem responde por quê, que dados existem, onde eles ficam — inclusive fora do Brasil — e como pedir cópia ou exclusão."
    >
      <Secao n={1} titulo="Quem é responsável pelo quê">
        <p>
          A LGPD (Lei 13.709/2018) separa dois papéis, e a diferença decide a
          quem você pede as coisas.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="text-ivory">
              {barbearia ?? "A barbearia que você atende"} é a controladora
            </strong>{" "}
            dos dados de quem agenda: é ela que decide coletar seu nome e
            telefone, para que usar e por quanto tempo guardar.
          </li>
          <li>
            <strong className="text-ivory">O CorteHub é o operador</strong>:
            trata esses dados <em>por conta da barbearia</em> e apenas para fazer
            o sistema funcionar. Não vendemos, não alugamos e não usamos os dados
            de clientes para finalidade própria.
          </li>
          <li>
            <strong className="text-ivory">
              O CorteHub é controlador dos dados da CONTA da barbearia
            </strong>{" "}
            — e-mail do dono, dados do estabelecimento e registros de uso da
            plataforma.
          </li>
        </ul>
        <p>
          O CorteHub é operado por <AConfirmar>[NOME COMPLETO]</AConfirmar>,
          pessoa física, inscrita no CPF{" "}
          <AConfirmar>[CPF]</AConfirmar>, com contato em{" "}
          <AConfirmar>[E-MAIL DE CONTATO]</AConfirmar>.
        </p>
      </Secao>

      <Secao n={2} titulo="Que dados são tratados">
        <p className="text-ivory">Se você agenda um horário</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Nome e número de WhatsApp</li>
          <li>
            Histórico de atendimentos: data, horário, serviços, profissional,
            valor, forma de pagamento e situação (concluído, cancelado, falta)
          </li>
          <li>
            Se você criar conta: e-mail, ou telefone, ou os dados básicos da
            conta Google que usar para entrar
          </li>
          <li>Saldo e movimentação de fidelidade, quando a barbearia usa</li>
        </ul>
        <p className="text-ivory">Se você é dono de barbearia</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>E-mail, senha (armazenada apenas como hash pelo Firebase Auth)</li>
          <li>
            Dados do estabelecimento: nome, endereço, contato, jornada, serviços
            e preços
          </li>
          <li>
            Dados operacionais e financeiros que você mesmo lança: equipe,
            comissões, despesas, estoque e pagamentos
          </li>
        </ul>
        <p>
          <strong className="text-ivory">
            Não tratamos dado sensível nem dado de pagamento.
          </strong>{" "}
          Não há cartão de crédito no sistema: registramos <em>como</em> o
          pagamento foi feito (Pix, dinheiro, débito, crédito), nunca o número do
          cartão. Não usamos cookies de publicidade nem rastreamento de terceiros.
        </p>
      </Secao>

      <Secao n={3} titulo="Para que servem, e com que base legal">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead className="text-ivory">
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">Finalidade</th>
                <th className="py-2 font-medium">Base legal (art. 7º)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">Marcar, confirmar e gerenciar o horário</td>
                <td className="py-2">Execução de contrato — inciso V</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">Avisar sobre o atendimento por WhatsApp</td>
                <td className="py-2">Execução de contrato — inciso V</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">
                  Manter o histórico para a gestão financeira da barbearia
                </td>
                <td className="py-2">Legítimo interesse do controlador — inciso IX</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">Cumprir obrigação fiscal e contábil</td>
                <td className="py-2">Obrigação legal — inciso II</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  Segurança do sistema e apuração de abuso
                </td>
                <td className="py-2">Legítimo interesse — inciso IX</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          O CorteHub <strong className="text-ivory">não envia marketing</strong>{" "}
          para clientes das barbearias. Mensagem de divulgação, se a barbearia
          quiser enviar um dia, depende de consentimento que ela precisará
          coletar — e que não é este documento.
        </p>
      </Secao>

      <Secao n={4} titulo="Com quem os dados são compartilhados">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="text-ivory">Google LLC (Google Cloud e Firebase)</strong>{" "}
            — hospeda o banco de dados, a autenticação, os arquivos e a execução
            do sistema. Atua como suboperador.
          </li>
          <li>
            <strong className="text-ivory">A própria barbearia</strong> — que é a
            controladora e enxerga os dados dos clientes dela, e apenas deles.
          </li>
          <li>
            <strong className="text-ivory">Meta Platforms</strong> — quando o
            envio de mensagens por WhatsApp estiver ativo, o número de telefone
            necessário para entregar a mensagem transita pela infraestrutura da
            Meta.{" "}
            <em>
              Este recurso ainda não está ativo: nenhuma mensagem foi enviada até
              a data desta política.
            </em>
          </li>
        </ul>
        <p>
          Uma barbearia <strong className="text-ivory">nunca</strong> enxerga
          dados de clientes de outra. O isolamento é imposto por regras no banco
          de dados, não apenas pela interface.
        </p>
      </Secao>

      <Secao n={5} titulo="Onde os dados ficam — inclusive fora do Brasil">
        <p>
          Parte do processamento acontece{" "}
          <strong className="text-ivory">fora do território nacional</strong>, e
          a LGPD exige que isso seja dito com clareza (art. 33):
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            O banco de dados e as funções de negócio operam na região de{" "}
            <strong className="text-ivory">São Paulo</strong> (
            <code className="text-xs">southamerica-east1</code>).
          </li>
          <li>
            A renderização das páginas — o componente que monta a tela que você
            vê e que, para isso, processa os dados em trânsito — executa em{" "}
            <strong className="text-ivory">Iowa, Estados Unidos</strong> (
            <code className="text-xs">us-central1</code>).
          </li>
        </ul>
        <p>
          A transferência ocorre para prestador que oferece grau de proteção
          adequado por meio de cláusulas contratuais padrão, nos termos do art.
          33, II. Se essa configuração mudar, esta seção muda junto.
        </p>
      </Secao>

      <Secao n={6} titulo="Por quanto tempo ficam guardados">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="text-ivory">Histórico de atendimento:</strong>{" "}
            enquanto a barbearia for cliente do CorteHub, porque é o que sustenta
            o financeiro e o histórico dela.
          </li>
          <li>
            <strong className="text-ivory">Encerrada a conta da barbearia:</strong>{" "}
            os dados ficam disponíveis por 30 dias para que ela exporte o que
            precisa, e depois são excluídos.
          </li>
          <li>
            <strong className="text-ivory">Registros fiscais e contábeis:</strong>{" "}
            pelo prazo que a lei exigir, mesmo após a exclusão do restante.
          </li>
        </ul>
      </Secao>

      <Secao n={7} titulo="Seus direitos, e a quem pedir">
        <p>
          A LGPD garante confirmação de tratamento, acesso, correção,
          portabilidade, informação sobre compartilhamento, revogação de
          consentimento e eliminação (art. 18).
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="text-ivory">Se você é cliente de uma barbearia</strong>{" "}
            — peça{" "}
            {barbearia ? `à ${barbearia}, ` : "à barbearia onde você se atende, "}
            que é a controladora. Ela usa o CorteHub para atender ao pedido, e
            nós a apoiamos no prazo legal.
          </li>
          <li>
            <strong className="text-ivory">Se você é dono de barbearia</strong> —
            peça diretamente ao CorteHub, em{" "}
            <AConfirmar>[E-MAIL DE CONTATO]</AConfirmar>.
          </li>
        </ul>
        <p>
          Se um pedido de cliente final chegar direto a nós, encaminhamos à
          barbearia responsável e avisamos você de que fizemos isso.
        </p>
      </Secao>

      <Secao n={8} titulo="Segurança">
        <p>
          Acesso autenticado, isolamento entre barbearias imposto no banco de
          dados, senha nunca armazenada em texto claro e tráfego cifrado. Nenhuma
          medida elimina risco por completo — se ocorrer incidente com risco
          relevante, comunicamos a barbearia e a ANPD nos termos do art. 48.
        </p>
      </Secao>

      <Secao n={9} titulo="Crianças e adolescentes">
        <p>
          O sistema não se destina a menores de 16 anos. Quando o atendimento for
          de menor, cabe à barbearia obter o consentimento de ao menos um dos
          pais ou responsável, na forma do art. 14.
        </p>
      </Secao>

      <Secao n={10} titulo="Mudanças nesta política">
        <p>
          Alteração relevante é avisada às barbearias com antecedência razoável.
          A data no topo é a da última revisão, e vale a versão publicada aqui.
        </p>
      </Secao>
    </DocumentoLegal>
  );
}
