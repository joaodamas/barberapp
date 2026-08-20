import type { Metadata } from "next";
import Link from "next/link";
import { AConfirmar, DocumentoLegal, Secao } from "@/components/legal/documento";

export const metadata: Metadata = {
  title: "Termos de Uso — CorteHub",
  description:
    "Condições de uso do CorteHub pelas barbearias: planos, responsabilidades, tratamento de dados e encerramento.",
};

/**
 * Termos de uso — contrato com a BARBEARIA, não com o cliente final.
 *
 * A seção 7 é a que sustenta juridicamente a postura declarada na política de
 * privacidade: a barbearia é controladora e o CorteHub é operador. Sem cláusula
 * escrita vinculando a barbearia a essa divisão, a postura seria uma afirmação
 * unilateral nossa — e a responsabilidade voltaria para a plataforma.
 *
 * ⚠️ Redigido a partir do que o produto faz. Precisa de revisão jurídica antes
 * de ir ao ar.
 */
export default function TermosPage() {
  return (
    <DocumentoLegal
      titulo="Termos de Uso"
      atualizadoEm="12 de agosto de 2026"
      resumo="Este é o contrato entre o CorteHub e a barbearia que o utiliza. Diz o que entregamos, o que esperamos de você, como funcionam teste e planos, e — a parte que mais importa — que os dados dos SEUS clientes são seus, e que você responde por eles perante a lei."
    >
      <Secao n={1} titulo="O que é o CorteHub">
        <p>
          Um sistema de gestão para barbearias: agenda que o cliente usa sozinho,
          painel do dono, controle financeiro e comunicação com o cliente. É
          oferecido como serviço pela internet, sem instalação.
        </p>
        <p>
          O CorteHub é operado por <AConfirmar>[NOME COMPLETO]</AConfirmar>,
          pessoa física, CPF <AConfirmar>[CPF]</AConfirmar>, contato em{" "}
          <AConfirmar>[E-MAIL DE CONTATO]</AConfirmar>.
        </p>
      </Secao>

      <Secao n={2} titulo="Sua conta">
        <p>
          Você é responsável pelo que acontece na sua conta e pelo sigilo da
          senha. Se der acesso a alguém da equipe, responde pelo que essa pessoa
          fizer. Avise-nos assim que suspeitar de uso indevido.
        </p>
        <p>
          Os dados que você cadastra precisam ser verdadeiros — o financeiro que
          o sistema calcula vale exatamente o que os dados de entrada valem.
        </p>
      </Secao>

      <Secao n={3} titulo="Teste e planos">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            O período de teste dura <strong className="text-ink">7 dias</strong>,
            com todos os recursos liberados e sem cartão.
          </li>
          <li>
            Os planos e o que cada um libera estão descritos na página de planos.
            O preço vigente é o informado na contratação.
          </li>
          <li>
            Enquanto não houver cobrança automática, a contratação e o pagamento
            são combinados diretamente conosco.
          </li>
        </ul>
      </Secao>

      <Secao n={4} titulo="Se o pagamento atrasar, você não perde a agenda">
        <p>
          Vencido o teste ou atrasada a mensalidade, a conta entra em{" "}
          <strong className="text-ink">modo leitura</strong>: você continua
          vendo tudo — agenda, clientes, financeiro e histórico — e{" "}
          <strong className="text-ink">
            seus clientes continuam agendando normalmente pelo link
          </strong>
          . O que fica bloqueado é editar.
        </p>
        <p>
          É decisão de produto, e vale a pena dizer por quê: barbearia que perde
          a agenda no meio de um sábado tem prejuízo com cliente que não tem nada
          a ver com a nossa cobrança. Nada é apagado, e tudo volta ao normal
          assim que a situação se regulariza.
        </p>
      </Secao>

      <Secao n={5} titulo="O que esperamos de você">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Usar o sistema para a atividade da sua barbearia, dentro da lei.</li>
          <li>
            Não tentar acessar dados de outra barbearia, burlar limites do plano
            ou sobrecarregar a plataforma.
          </li>
          <li>
            Informar seus clientes sobre o tratamento dos dados deles — ver a
            seção 7.
          </li>
        </ul>
      </Secao>

      <Secao n={6} titulo="Disponibilidade e limites">
        <p>
          Trabalhamos para manter o sistema no ar, mas{" "}
          <strong className="text-ink">
            não prometemos funcionamento ininterrupto
          </strong>
          . Pode haver manutenção, falha de terceiro de quem dependemos ou
          indisponibilidade fora do nosso controle.
        </p>
        <p>
          Nossa responsabilidade limita-se ao valor pago pela barbearia nos 12
          meses anteriores ao evento. Não respondemos por lucro cessante nem por
          decisão comercial tomada com base em relatório do sistema — a decisão
          de preço, contratação ou demissão continua sua.
        </p>
      </Secao>

      <Secao n={7} titulo="Dados dos seus clientes — a divisão de responsabilidade">
        <p>
          Esta é a cláusula mais importante deste contrato, e a que muitas
          plataformas deixam implícita.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="text-ink">
              Você é o CONTROLADOR dos dados dos seus clientes.
            </strong>{" "}
            É você quem decide coletar nome, telefone e histórico, para que usar
            e por quanto tempo guardar. Perante a LGPD, quem responde por eles é
            você.
          </li>
          <li>
            <strong className="text-ink">O CorteHub é o OPERADOR.</strong>{" "}
            Tratamos esses dados apenas seguindo suas instruções e para fazer o
            sistema funcionar. Não usamos para finalidade própria, não vendemos e
            não compartilhamos com outra barbearia.
          </li>
        </ul>
        <p>Disso decorrem obrigações concretas de cada lado.</p>
        <p className="text-ink">Cabe a você</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            Ter base legal para tratar os dados dos seus clientes e informá-los —
            no mínimo apontando a{" "}
            <Link href="/privacidade" className="text-gold-strong underline underline-offset-2">
              Política de Privacidade
            </Link>
            .
          </li>
          <li>
            Atender aos pedidos deles: cópia, correção, portabilidade e exclusão.
            Nós damos o suporte técnico para você cumprir no prazo.
          </li>
          <li>
            Não usar os dados para finalidade incompatível com a que foi
            informada — marketing sem consentimento, por exemplo.
          </li>
        </ul>
        <p className="text-ink">Cabe a nós</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Manter medidas de segurança e o isolamento entre barbearias.</li>
          <li>
            Avisar você sem demora se houver incidente de segurança que atinja
            seus dados.
          </li>
          <li>
            Não usar os dados dos seus clientes para nada além de operar o
            serviço para você.
          </li>
          <li>
            Devolver ou eliminar os dados ao fim do contrato, nos prazos da
            política de privacidade.
          </li>
        </ul>
      </Secao>

      <Secao n={8} titulo="Os dados são seus">
        <p>
          O conteúdo que você cadastra continua seu. Enquanto a conta existir,
          você pode extraí-lo; encerrada a conta, há{" "}
          <strong className="text-ink">30 dias</strong> para exportar antes da
          exclusão.
        </p>
        <p>
          O software, a marca e a interface do CorteHub são nossos, e o contrato
          concede apenas o direito de usar o serviço enquanto ele vigorar.
        </p>
      </Secao>

      <Secao n={9} titulo="Encerramento">
        <p>
          Você pode encerrar quando quiser, sem multa. Podemos encerrar em caso
          de descumprimento grave destes termos, de uso ilegal ou de inadimplência
          prolongada — sempre com aviso prévio e com o prazo de exportação da
          seção 8 preservado.
        </p>
      </Secao>

      <Secao n={10} titulo="Mudanças nestes termos">
        <p>
          Mudança relevante é avisada com antecedência razoável. Continuar usando
          o serviço depois da vigência significa aceitar a nova versão; se não
          concordar, pode encerrar sem custo.
        </p>
      </Secao>

      <Secao n={11} titulo="Lei aplicável e foro">
        <p>
          Aplica-se a lei brasileira. Fica eleito o foro da comarca de{" "}
          <AConfirmar>[COMARCA]</AConfirmar>, com renúncia a qualquer outro.
        </p>
      </Secao>
    </DocumentoLegal>
  );
}
