/**
 * Quais caminhos de entrada existem, e qual abre primeiro.
 *
 * O login abria na aba **Celular** com o provider Phone desabilitado no
 * Firebase Auth. Todo cliente que recebia o link da barbearia caía numa aba
 * quebrada: digitava o número, pedia o código, e levava um erro que fala de
 * "projeto". É o primeiro contato de cada pessoa com o produto, e ele estava
 * quebrado por padrão.
 *
 * A regra que faltava, e que este arquivo torna verificável:
 *
 * > **O método padrão precisa estar entre os disponíveis.**
 *
 * Ela morava no JSX, onde nada podia afirmá-la. Aqui é uma função de três
 * linhas, e o teste falha no dia em que alguém habilitar um método sem ligar o
 * provider — ou desligar um provider sem mexer no padrão.
 *
 * Mostrar uma escolha que não funciona é pior do que não oferecer escolha: foi
 * a mesma decisão tomada nos botões de pagamento antecipado da tela de agendar.
 * `SMS_HABILITADO` é a chave de volta — quando o provider entrar, a aba
 * reaparece com uma linha.
 */

export type MetodoDeLogin = "phone" | "email";

/** Provider Phone no Firebase Auth. Desabilitado no projeto. */
export const SMS_HABILITADO = false;

/** Os métodos que de fato funcionam, na ordem em que devem ser oferecidos. */
export function metodosDisponiveis(sms: boolean = SMS_HABILITADO): MetodoDeLogin[] {
  return sms ? ["phone", "email"] : ["email"];
}

/** O que abre quando a pessoa chega. Sempre o primeiro que funciona. */
export function metodoPadrao(sms: boolean = SMS_HABILITADO): MetodoDeLogin {
  return metodosDisponiveis(sms)[0];
}

/** A barra de abas só tem sentido com mais de uma opção real. */
export function mostrarSeletor(sms: boolean = SMS_HABILITADO): boolean {
  return metodosDisponiveis(sms).length > 1;
}
