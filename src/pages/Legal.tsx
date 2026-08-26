/**
 * Legal, Termos de Uso e Política de Privacidade.
 *
 * Um componente só, dois documentos. Não é economia de arquivo: os dois textos
 * compartilham o mesmo esqueleto (índice lateral com âncoras, versão visível,
 * data de vigência, nota de minuta) e mantê-los em componentes separados faria
 * a próxima revisão jurídica precisar ser aplicada duas vezes, que é
 * exatamente como um dos dois fica desatualizado sem ninguém perceber.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CONTEÚDO É VERIFICÁVEL, NÃO DECORATIVO
 *
 * Cada afirmação aqui corresponde a algo que o sistema realmente faz, e a
 * origem está anotada na seção: `docs/11_SEGURANCA` (LGPD e PCI-DSS),
 * `memory/restrictions.md` L1, `docs/03_REGRAS_DE_NEGOCIO` (cobrança e
 * cancelamento) e `supabase/schema.sql` (o que de fato tem coluna no banco).
 * Política de privacidade que promete controle inexistente é pior que política
 * nenhuma: vira declaração falsa a uma autoridade, e não só marketing ruim. Por
 * isso a seção de direitos do titular diz, com todas as letras, que hoje o
 * atendimento é por e-mail e manual, a esteira self-service é Fase 4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOBRE OS QUATRO ESTADOS
 *
 * Esta tela não busca dado: o texto legal é conteúdo versionado junto com o
 * código, de propósito, ele precisa ser idêntico para todo mundo e precisar de
 * deploy para mudar. Sem requisição não há carregando, vazio nem erro; o único
 * estado possível é o de sucesso. Fabricar um spinner aqui seria teatro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERSÃO
 *
 * `VERSAO_TERMOS` e `VERSAO_PRIVACIDADE` são exportadas porque o registro de consentimento da Fase 4
 * (`docs/09_BACKLOG`) precisa gravar *qual* versão a pessoa aceitou. Guardar só
 * "aceitou os termos" não prova nada quando o texto muda. Ao alterar qualquer
 * palavra com efeito jurídico, suba a versão, é ela que o consentimento cita.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { formatarDataLonga } from '@/utils/formato';
import estilos from './Legal.module.css';

export type DocumentoLegal = 'termos' | 'privacidade';

/**
 * Versão de cada documento, consumida pelo registro de consentimento (Fase 4).
 *
 * São duas constantes de string em vez de um objeto por um motivo prosaico e
 * real: o Fast Refresh só preserva estado quando o módulo exporta componentes e
 * constantes simples. Um `Record` exportado aqui faria toda edição desta página
 * recarregar o app inteiro em desenvolvimento, e é uma página que se revisa
 * lendo e rolando devagar.
 */
export const VERSAO_TERMOS = '0.1.0-minuta';
export const VERSAO_PRIVACIDADE = '0.1.0-minuta';

const VERSOES: Record<DocumentoLegal, string> = {
  termos: VERSAO_TERMOS,
  privacidade: VERSAO_PRIVACIDADE,
};

/** Data de vigência, em ISO. Uma só porque os dois nasceram juntos. */
const VIGENCIA = '2026-08-24';

interface Secao {
  id: string;
  titulo: string;
  corpo: ReactNode;
}

interface Documento {
  chave: DocumentoLegal;
  titulo: string;
  subtitulo: string;
  resumo: ReactNode;
  secoes: Secao[];
}

/**
 * Marca um dado que só a revisão jurídica pode preencher.
 *
 * Existe para que o buraco seja impossível de não ver. A alternativa, inventar
 * um CNPJ plausível para "ficar bonito na tela", produziria um contrato que
 * aponta para uma empresa que não existe, e ninguém revisaria o que parece
 * pronto.
 */
function Pendente({ children }: { children: string }) {
  return <mark className={estilos.pendente}>{children}</mark>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Termos de Uso
   ═══════════════════════════════════════════════════════════════════════════ */

const TERMOS: Documento = {
  chave: 'termos',
  titulo: 'Termos de Uso',
  subtitulo: 'As regras da relação entre você e o Pautaria.',

  resumo: (
    <ul className={estilos.resumoLista}>
      <li>O Pautaria é um quadro de pautas. Escolher o ofício já entrega etapas, campos e termos prontos, não há tela de configuração antes do quadro.</li>
      <li>O conteúdo das suas pautas é seu. Nós hospedamos e protegemos; não usamos para treinar nada nem vendemos a ninguém.</li>
      <li>Existe um plano gratuito permanente. Os planos pagos são cobrados pela Asaas, com recorrência mensal ou anual.</li>
      <li>O cancelamento é de um clique, sem funil de retenção, e o acesso continua até o fim do período já pago.</li>
    </ul>
  ),

  secoes: [
    {
      id: 'quem-oferece',
      titulo: '1. Quem oferece o serviço',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O Pautaria é operado por <Pendente>razão social, CNPJ e endereço a preencher na revisão jurídica</Pendente>,
            adiante chamada apenas de “Pautaria”.
          </p>
          <p className={estilos.paragrafo}>
            Enquanto esses dados não estiverem preenchidos, este documento é minuta interna e não
            produz efeito contratual. Não publique o produto com esta seção em branco.
          </p>
        </>
      ),
    },
    {
      id: 'o-servico',
      titulo: '2. O que o Pautaria faz',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O Pautaria é um serviço de software pela internet (SaaS) para organizar pautas de
            trabalho em um quadro. Você escolhe um ofício e o sistema entrega as etapas, os rótulos
            de campo e a terminologia daquele ofício já preenchidos.
          </p>
          <p className={estilos.paragrafo}>Hoje o serviço inclui:</p>
          <ul className={estilos.lista}>
            <li>quadro de pautas em colunas por etapa, com visualização em tabela;</li>
            <li>criação, edição, movimentação e arquivamento de pautas;</li>
            <li>workspaces com várias pessoas, papéis e convites por link;</li>
            <li>troca de ofício a qualquer momento, em qualquer plano.</li>
          </ul>
          <p className={estilos.paragrafo}>
            Podemos incluir, alterar ou descontinuar funcionalidades. Mudança que reduza de forma
            relevante o que você já usa é anunciada com antecedência razoável e dá direito a
            cancelar sem custo adicional.
          </p>
        </>
      ),
    },
    {
      id: 'conta',
      titulo: '3. Sua conta',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Para usar o Pautaria é preciso criar uma conta com nome e e-mail válidos, e ter
            capacidade civil para contratar.
          </p>
          <p className={estilos.paragrafo}>
            A senha é pessoal e intransferível. Exigimos no mínimo dez caracteres e recusamos senhas
            que já apareceram em vazamentos públicos conhecidos, a verificação é feita sem que a
            sua senha saia do processo de autenticação. Ainda assim, guardar a senha em segurança é
            responsabilidade sua; se suspeitar de acesso indevido, troque-a e nos avise.
          </p>
          <p className={estilos.paragrafo}>
            Convites de equipe funcionam por link, valem sete dias e só servem para o e-mail
            convidado. Guardamos apenas o resumo criptográfico do token do convite: um link perdido
            não é recuperável, só revogável e recriável.
          </p>
        </>
      ),
    },
    {
      id: 'workspace',
      titulo: '4. Workspace, papéis e conteúdo',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O workspace é a unidade do serviço: cada um tem seus ofícios, suas pautas, sua equipe e
            seu plano. Dados de um workspace não são acessíveis a outro, e essa separação é
            verificada automaticamente a cada versão publicada.
          </p>
          <ul className={estilos.lista}>
            <li><strong>Dono</strong>, administra tudo, incluindo assinatura e exclusão do workspace. Sempre existe pelo menos um.</li>
            <li><strong>Admin</strong>, gerencia equipe, ofícios e pautas.</li>
            <li><strong>Membro</strong>, cria, edita e move pautas.</li>
          </ul>
          <p className={estilos.paragrafo}>
            O conteúdo que você cria continua seu. Você nos concede apenas a licença técnica
            necessária para hospedar, exibir, copiar em backup e transmitir esse conteúdo a você e a
            quem você deu acesso, nada além disso. Não usamos o conteúdo das suas pautas para
            treinar modelos, para publicidade, nem o cedemos a terceiros.
          </p>
          <p className={estilos.paragrafo}>
            Em contrapartida, você responde pelo que publica no quadro: garante que tem direito de
            usar aquele conteúdo e que ele não viola lei nem direito de outra pessoa.
          </p>
        </>
      ),
    },
    {
      id: 'planos',
      titulo: '5. Planos, cobrança e cancelamento',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O plano gratuito é permanente, não é degustação. Os planos pagos ampliam limites, de
            quadros e de pessoas, e são cobrados de forma recorrente, mensal ou anual, conforme o
            ciclo escolhido na contratação.
          </p>
          <p className={estilos.paragrafo}>
            <strong>Quem processa o pagamento é a Asaas.</strong> O pagamento acontece em página
            hospedada por ela. O Pautaria não possui campo de cartão em ponto algum e não vê, não
            transporta e não armazena dado de cartão.
          </p>
          <p className={estilos.paragrafo}>
            O valor é congelado no momento da contratação: uma mudança futura na tabela de preços
            não altera o contrato vigente. Reajuste só se aplica a você no ciclo seguinte, com aviso
            prévio, e você pode cancelar antes que ele entre em vigor.
          </p>
          <p className={estilos.paragrafo}>
            <strong>Cancelamento.</strong> Só o dono do workspace cancela, em um clique, sem funil
            de retenção. O acesso ao plano contratado continua até o fim do período já pago; a
            partir daí o workspace volta ao plano gratuito. Não há devolução proporcional do período
            em curso, justamente porque ele continua disponível até o fim.
          </p>
          <p className={estilos.paragrafo}>
            Se um pagamento falhar, a assinatura fica em atraso e a Asaas faz as tentativas de
            cobrança conforme a régua dela. Persistindo a falta de pagamento, o workspace volta ao
            plano gratuito, as pautas continuam lá, sujeitas aos limites do plano gratuito.
          </p>
          <p className={estilos.paragrafo}>
            Direito de arrependimento: contratação feita fora de estabelecimento comercial pode ser
            desfeita em sete dias, nos termos do art. 49 do Código de Defesa do Consumidor, quando
            aplicável. <Pendente>Confirmar com a revisão jurídica a redação e a operacionalização do reembolso</Pendente>.
          </p>
        </>
      ),
    },
    {
      id: 'uso-aceitavel',
      titulo: '6. Uso aceitável',
      corpo: (
        <>
          <p className={estilos.paragrafo}>Ao usar o Pautaria, você concorda em não:</p>
          <ul className={estilos.lista}>
            <li>tentar acessar dados de workspace do qual você não faz parte;</li>
            <li>contornar limites de plano, controles de acesso ou limites de requisição;</li>
            <li>sondar, varrer ou testar a segurança do serviço sem autorização escrita nossa;</li>
            <li>publicar conteúdo ilícito, ou usar o serviço para praticar ato ilícito;</li>
            <li>revender ou disponibilizar o serviço a terceiros como se fosse seu, salvo acordo específico.</li>
          </ul>
          <p className={estilos.paragrafo}>
            Encontrou uma falha de segurança? Avise em vez de explorar. Relatos feitos de boa-fé,
            sem exfiltrar dado de terceiro e sem tornar público antes da correção, são bem-vindos e
            não geram retaliação da nossa parte.
          </p>
        </>
      ),
    },
    {
      id: 'disponibilidade',
      titulo: '7. Disponibilidade',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O serviço é fornecido no estado em que se encontra e depende de infraestrutura de
            terceiros. Não há acordo de nível de serviço (SLA) contratado nesta fase, e não
            prometemos disponibilidade ininterrupta.
          </p>
          <p className={estilos.paragrafo}>
            Fazemos manutenção quando necessário, preferindo horários de menor uso, e avisamos
            antecipadamente quando a parada for programada e relevante.
          </p>
        </>
      ),
    },
    {
      id: 'propriedade',
      titulo: '8. Propriedade intelectual',
      corpo: (
        <p className={estilos.paragrafo}>
          O software, a marca, a identidade visual, os ofícios de fábrica e os textos do produto são
          nossos ou licenciados a nós. Estes Termos não transferem nada disso a você, dão apenas o
          direito de usar o serviço enquanto o contrato durar. O conteúdo que você cria segue sendo
          seu, como diz a seção 4.
        </p>
      ),
    },
    {
      id: 'encerramento',
      titulo: '9. Encerramento',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Você pode encerrar a relação a qualquer momento, cancelando a assinatura e pedindo a
            exclusão da conta. Enquanto a esteira self-service não existir, o pedido de exclusão é
            feito por e-mail e atendido manualmente, a Política de Privacidade explica como.
          </p>
          <p className={estilos.paragrafo}>
            Podemos suspender ou encerrar o acesso em caso de violação destes Termos, de ordem
            judicial, ou de risco concreto à segurança de outras pessoas. Sempre que possível,
            avisamos antes e damos oportunidade de corrigir.
          </p>
        </>
      ),
    },
    {
      id: 'responsabilidade',
      titulo: '10. Responsabilidade',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Respondemos pelos danos que causarmos por dolo ou culpa, na forma da lei. Não
            respondemos por indisponibilidade causada por terceiros fora do nosso controle, por uso
            indevido de credencial sob sua guarda, nem por perda de conteúdo que você tenha excluído
            deliberadamente.
          </p>
          <p className={estilos.paragrafo}>
            <Pendente>Limite de responsabilidade, exclusões e redação final a definir na revisão jurídica</Pendente>,
            cláusula de limitação é justamente onde uma minuta escrita sem advogado costuma ser
            nula, e uma cláusula nula não protege ninguém.
          </p>
        </>
      ),
    },
    {
      id: 'alteracoes-termos',
      titulo: '11. Alterações destes Termos',
      corpo: (
        <p className={estilos.paragrafo}>
          Estes Termos têm versão e data de vigência, mostradas no topo desta página. Quando o texto
          mudar de forma relevante, avisamos antes de a nova versão passar a valer, e a versão
          anterior continua identificada pelo número dela. Continuar usando o serviço depois da
          vigência significa aceitar a versão nova; se não concordar, você pode cancelar.
        </p>
      ),
    },
    {
      id: 'lei-foro',
      titulo: '12. Lei aplicável e foro',
      corpo: (
        <p className={estilos.paragrafo}>
          Aplica-se a lei brasileira. Fica eleito o foro da comarca de{' '}
          <Pendente>comarca a preencher</Pendente>, ressalvado o direito do consumidor de demandar
          no foro do seu domicílio.
        </p>
      ),
    },
    {
      id: 'contato-termos',
      titulo: '13. Contato',
      corpo: (
        <p className={estilos.paragrafo}>
          Dúvidas sobre estes Termos:{' '}
          <Pendente>endereço de e-mail de contato a preencher</Pendente>. Assuntos de dados
          pessoais têm canal próprio, descrito na{' '}
          <Link to="/privacidade">Política de Privacidade</Link>.
        </p>
      ),
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   Política de Privacidade
   ═══════════════════════════════════════════════════════════════════════════ */

const PRIVACIDADE: Documento = {
  chave: 'privacidade',
  titulo: 'Política de Privacidade',
  subtitulo: 'O que tratamos, por quê, com quem compartilhamos e o que você pode exigir.',

  resumo: (
    <ul className={estilos.resumoLista}>
      <li>Guardamos pouco: nome, e-mail e as iniciais do seu avatar. Só isso identifica você na nossa base.</li>
      <li>CPF ou CNPJ apenas trafega até a Asaas na hora de assinar. Não fica armazenado conosco.</li>
      <li>Nenhum dado de cartão passa por aqui, em ponto algum, o pagamento acontece na página da Asaas.</li>
      <li>Endereço de IP em registro de auditoria é guardado pseudonimizado, nunca em claro.</li>
      <li>Seus direitos de titular são atendidos hoje por e-mail, com atendimento manual. Não existe botão de exportar ou excluir no app; dizemos isso porque é verdade.</li>
    </ul>
  ),

  secoes: [
    {
      id: 'controlador',
      titulo: '1. Quem é o controlador',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O controlador dos dados pessoais tratados no Pautaria é{' '}
            <Pendente>razão social, CNPJ e endereço a preencher na revisão jurídica</Pendente>.
          </p>
          <p className={estilos.paragrafo}>
            Enquanto isso não estiver preenchido, esta página é minuta interna e não serve como
            política publicada perante titulares ou autoridade.
          </p>
        </>
      ),
    },
    {
      id: 'dados-tratados',
      titulo: '2. Que dados tratamos',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            A lista abaixo é exaustiva quanto ao que existe hoje. Se um dado não está aqui, ele não
            tem lugar onde ser guardado no sistema.
          </p>

          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <caption className="apenas-leitor">
                Dados pessoais tratados pelo Pautaria, sua finalidade e onde ficam.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Dado</th>
                  <th scope="col">Para quê</th>
                  <th scope="col">Onde fica</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Nome</th>
                  <td>identificar você para a sua equipe</td>
                  <td>nossa base</td>
                </tr>
                <tr>
                  <th scope="row">E-mail</th>
                  <td>login, recuperação de senha e convites</td>
                  <td>nossa base</td>
                </tr>
                <tr>
                  <th scope="row">Iniciais e matiz do avatar</th>
                  <td>identificação visual no quadro; derivadas do nome</td>
                  <td>nossa base</td>
                </tr>
                <tr>
                  <th scope="row">CPF ou CNPJ</th>
                  <td>exigência fiscal do processamento de pagamento</td>
                  <td>
                    <strong>apenas em trânsito</strong> até a Asaas, não repousa conosco
                  </td>
                </tr>
                <tr>
                  <th scope="row">Telefone (opcional)</th>
                  <td>contato de cobrança, se você informar</td>
                  <td>
                    <strong>apenas em trânsito</strong> até a Asaas
                  </td>
                </tr>
                <tr>
                  <th scope="row">Identificadores e status de cobrança</th>
                  <td>saber qual plano está ativo e até quando</td>
                  <td>nossa base</td>
                </tr>
                <tr>
                  <th scope="row">Conteúdo das pautas</th>
                  <td>é o serviço; pode conter dado pessoal que você escolher digitar</td>
                  <td>nossa base, isolado por workspace</td>
                </tr>
                <tr>
                  <th scope="row">Registros de auditoria</th>
                  <td>segurança, investigação de incidente e prova de quem fez o quê</td>
                  <td>nossa base, sem dado pessoal em texto claro</td>
                </tr>
                <tr>
                  <th scope="row">Endereço de IP</th>
                  <td>limitar abuso e correlacionar tentativas suspeitas</td>
                  <td>
                    guardado <strong>pseudonimizado</strong> por HMAC, nunca em claro
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className={estilos.nota}>
            O IP pseudonimizado permite dizer “estas dez tentativas vieram da mesma origem” sem
            permitir dizer de onde. É a minimização do art. 12 da LGPD aplicada ao dado que mais
            costuma virar cadastro de localização sem ninguém decidir isso.
          </p>
        </>
      ),
    },
    {
      id: 'nao-tratamos',
      titulo: '3. O que não tratamos',
      corpo: (
        <>
          <ul className={estilos.lista}>
            <li>
              <strong>Nenhum dado de cartão</strong>, em nenhum ponto: não existe campo de cartão no
              Pautaria. Número, validade e código de segurança são digitados na página hospedada
              pela Asaas e nunca passam pelo nosso sistema.
            </li>
            <li>Endereço, data de nascimento, foto ou documento digitalizado, não pedimos e não temos onde guardar.</li>
            <li>Telefone obrigatório: ele é opcional, e só na contratação de plano pago.</li>
            <li>Dado sensível (art. 5º, II da LGPD): não solicitamos nenhum. Se você digitar algum no conteúdo de uma pauta, ele fica sob a sua responsabilidade como quem decidiu inseri-lo.</li>
            <li>Rastreamento publicitário, perfilamento comportamental ou venda de dados: não fazemos, em nenhuma hipótese.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'base-legal',
      titulo: '4. Base legal',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Tratamos seus dados para <strong>execução do contrato</strong> firmado com você
            (art. 7º, V da LGPD): sem nome, e-mail e identificadores de cobrança, não há como
            entregar o serviço nem cobrar por ele.
          </p>
          <p className={estilos.paragrafo}>
            Registros de auditoria e limitação de abuso sustentam a segurança do próprio serviço
            contratado.{' '}
            <Pendente>Confirmar na revisão jurídica se esses registros ficam sob execução de contrato, cumprimento de obrigação legal ou legítimo interesse, e declarar a escolha aqui</Pendente>.
          </p>
        </>
      ),
    },
    {
      id: 'finalidades',
      titulo: '5. Para que usamos',
      corpo: (
        <ul className={estilos.lista}>
          <li>criar e manter sua conta, autenticar seu acesso e recuperar sua senha;</li>
          <li>exibir você para a sua equipe no workspace;</li>
          <li>processar a assinatura, a cobrança recorrente e o cancelamento;</li>
          <li>aplicar os limites do plano contratado;</li>
          <li>proteger o serviço contra abuso e investigar incidentes de segurança;</li>
          <li>responder às suas solicitações de suporte.</li>
        </ul>
      ),
    },
    {
      id: 'compartilhamento',
      titulo: '6. Com quem compartilhamos',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Compartilhamos apenas com quem é necessário para operar o serviço, na condição de
            operadores, e apenas o mínimo que cada um precisa:
          </p>
          <ul className={estilos.lista}>
            <li><strong>Supabase</strong>, banco de dados, autenticação e funções do servidor.</li>
            <li><strong>Vercel</strong>, hospedagem da aplicação que roda no seu navegador.</li>
            <li><strong>Asaas</strong>, emissão e processamento das cobranças recorrentes. Recebe nome de cobrança, e-mail, CPF ou CNPJ e, se informado, telefone.</li>
          </ul>
          <p className={estilos.paragrafo}>
            Também podemos compartilhar dados para cumprir obrigação legal ou ordem de autoridade
            competente, e, nesse caso, avisamos você sempre que a lei permitir.
          </p>
          <p className={estilos.paragrafo}>
            <strong>Transferência internacional.</strong> Nossos provedores de infraestrutura podem
            processar dados fora do Brasil, conforme a região configurada do projeto.{' '}
            <Pendente>Declarar aqui a região efetiva de hospedagem e a salvaguarda aplicável (art. 33 da LGPD) na revisão jurídica</Pendente>.
          </p>
        </>
      ),
    },
    {
      id: 'armazenamento-navegador',
      titulo: '7. Cookies e armazenamento no navegador',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Não usamos cookie de publicidade nem de rastreamento de terceiro. O que existe é
            armazenamento local usado pela biblioteca de autenticação para manter você conectado
            entre visitas, sem ele, você precisaria digitar a senha a cada carregamento de página.
          </p>
          <p className={estilos.paragrafo}>
            Limpar os dados do site no navegador encerra a sessão e não apaga nada da sua conta.
          </p>
        </>
      ),
    },
    {
      id: 'seguranca',
      titulo: '8. Como protegemos',
      corpo: (
        <>
          <ul className={estilos.lista}>
            <li>
              <strong>Isolamento entre workspaces no banco</strong>, não só na tela: as regras de
              acesso vivem no banco de dados, e um teste automatizado de isolamento é condição para
              publicar qualquer versão.
            </li>
            <li>Senha com no mínimo dez caracteres e recusa de senhas presentes em vazamentos públicos conhecidos.</li>
            <li>Sessão curta, com renovação rotativa: reutilizar um token antigo derruba a família inteira de tokens.</li>
            <li>Token de convite guardado apenas como resumo criptográfico, um vazamento do banco não devolve o link.</li>
            <li>Registro de auditoria somente-adição, que distingue o que o servidor afirma do que o cliente afirma.</li>
            <li>Nunca registramos senha, token, CPF, CNPJ ou dado financeiro em texto claro nos nossos logs.</li>
          </ul>
          <p className={estilos.nota}>
            Nenhuma medida elimina risco por completo. Em caso de incidente com risco relevante,
            comunicamos você e a Autoridade Nacional de Proteção de Dados, na forma do art. 48 da
            LGPD.
          </p>
        </>
      ),
    },
    {
      id: 'retencao',
      titulo: '9. Por quanto tempo guardamos',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Dados de conta e conteúdo de pautas ficam enquanto a conta existir. Pedida a exclusão,
            apagamos o que não estivermos obrigados a manter.
          </p>
          <p className={estilos.paragrafo}>
            Registros de cobrança e de auditoria são mantidos pelo prazo necessário ao cumprimento
            de obrigações legais e à defesa em eventual processo, ainda que a conta seja encerrada.
          </p>
          <p className={estilos.paragrafo}>
            <strong>Honestidade sobre o estado atual:</strong> a política formal de retenção, com
            prazos por categoria de dado e purga automática, está planejada para a Fase 4 e ainda
            não existe. Hoje a exclusão é executada manualmente, sob pedido.{' '}
            <Pendente>Definir os prazos por categoria na revisão jurídica</Pendente>.
          </p>
        </>
      ),
    },
    {
      id: 'direitos',
      titulo: '10. Seus direitos',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            O art. 18 da LGPD garante a você, entre outros, o direito de obter:
          </p>
          <ul className={estilos.lista}>
            <li>confirmação de que tratamos seus dados, e acesso a eles;</li>
            <li>correção de dado incompleto, inexato ou desatualizado;</li>
            <li>anonimização, bloqueio ou eliminação de dado desnecessário ou excessivo;</li>
            <li>portabilidade dos seus dados a outro fornecedor;</li>
            <li>eliminação dos dados tratados com base em consentimento;</li>
            <li>informação sobre com quem compartilhamos seus dados;</li>
            <li>revisão de decisão automatizada, o Pautaria não toma nenhuma sobre você.</li>
          </ul>

          <div className={estilos.destaqueHonesto}>
            <p className={estilos.paragrafo}>
              <strong>Como esses direitos são atendidos hoje:</strong> por e-mail, com apuração
              manual, no prazo legal. <strong>Não existe botão de exportar ou de excluir a conta
              dentro do aplicativo.</strong> A esteira self-service, exportação dos seus dados e
              exclusão com purga real, está planejada para a Fase 4 e ainda não foi construída.
            </p>
            <p className={estilos.paragrafo}>
              Preferimos dizer isso a desenhar um botão que não faz o que promete. Quando a esteira
              existir, esta seção muda e a versão do documento sobe.
            </p>
          </div>

          <p className={estilos.paragrafo}>
            Para exercer qualquer um desses direitos, escreva para{' '}
            <Pendente>endereço de e-mail do encarregado a preencher</Pendente>, informando o e-mail
            cadastrado na sua conta. Pedimos confirmação de identidade antes de atender, é a mesma
            proteção que impede outra pessoa de pedir seus dados no seu lugar.
          </p>
        </>
      ),
    },
    {
      id: 'menores',
      titulo: '11. Crianças e adolescentes',
      corpo: (
        <p className={estilos.paragrafo}>
          O Pautaria é uma ferramenta de trabalho e não se destina a menores de 18 anos. Não
          coletamos conscientemente dados de crianças ou adolescentes. Ao identificarmos conta nessa
          situação, ela é encerrada e os dados, eliminados.
        </p>
      ),
    },
    {
      id: 'alteracoes-privacidade',
      titulo: '12. Alterações desta Política',
      corpo: (
        <p className={estilos.paragrafo}>
          Esta Política tem versão e data de vigência, mostradas no topo da página. Mudança
          relevante é anunciada antes de entrar em vigor. A partir da Fase 4, cada aceite ficará
          registrado com o número da versão aceita, é o que permite saber, depois, exatamente a
          qual texto cada pessoa concordou.
        </p>
      ),
    },
    {
      id: 'encarregado',
      titulo: '13. Encarregado e contato',
      corpo: (
        <>
          <p className={estilos.paragrafo}>
            Encarregado pelo tratamento de dados pessoais (art. 41 da LGPD):{' '}
            <Pendente>nome e e-mail do encarregado a preencher</Pendente>.
          </p>
          <p className={estilos.paragrafo}>
            Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados
            (ANPD).
          </p>
        </>
      ),
    },
  ],
};

const DOCUMENTOS: Record<DocumentoLegal, Documento> = {
  termos: TERMOS,
  privacidade: PRIVACIDADE,
};

/* ═══════════════════════════════════════════════════════════════════════════
   Componente
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  documento: DocumentoLegal;
}

export function Legal({ documento }: Props) {
  const doc = DOCUMENTOS[documento];
  const primeiraSecao = doc.secoes[0]?.id ?? '';
  const [secaoAtiva, setSecaoAtiva] = useState(primeiraSecao);

  // Trocar de documento é trocar de página, mesmo sem desmontar o componente:
  // sem isto, quem estava no rodapé dos Termos cairia no meio da Privacidade.
  useEffect(() => {
    setSecaoAtiva(primeiraSecao);
    window.scrollTo({ top: 0 });
  }, [primeiraSecao]);

  // Destaque do índice conforme a leitura avança. O `-68%` no rodapé do
  // `rootMargin` encolhe a área de observação para a faixa superior da tela: a
  // seção só assume o destaque quando o título dela realmente chega ao topo, e
  // não quando aparece de relance no fim da rolagem.
  useEffect(() => {
    const alvos = doc.secoes
      .map((secao) => document.getElementById(secao.id))
      .filter((elemento): elemento is HTMLElement => elemento !== null);

    if (alvos.length === 0) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visiveis = entradas.filter((entrada) => entrada.isIntersecting);
        if (visiveis.length === 0) return;

        const maisAlta = visiveis.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setSecaoAtiva(maisAlta.target.id);
      },
      { rootMargin: '0px 0px -68% 0px', threshold: 0 },
    );

    alvos.forEach((elemento) => observador.observe(elemento));
    return () => observador.disconnect();
  }, [doc]);

  return (
    <div className={estilos.tela}>
      <a href="#conteudo" className="pular-para-conteudo">
        Pular para o conteúdo
      </a>

      <header className={estilos.topo}>
        <Link to="/" className={estilos.marca}>
          <span className={estilos.bolinha} aria-hidden="true" />
          <span className={estilos.wordmark}>Pautaria</span>
        </Link>

        <nav className={estilos.alternador} aria-label="Documentos legais">
          <Link
            to="/termos"
            className={documento === 'termos' ? estilos.abaAtiva : estilos.aba}
            aria-current={documento === 'termos' ? 'page' : undefined}
          >
            Termos de Uso
          </Link>
          <Link
            to="/privacidade"
            className={documento === 'privacidade' ? estilos.abaAtiva : estilos.aba}
            aria-current={documento === 'privacidade' ? 'page' : undefined}
          >
            Privacidade
          </Link>
        </nav>
      </header>

      <div className={estilos.avisoMinuta}>
        <Aviso tom="atencao" titulo="Minuta, não use como documento válido">
          <span>
            Este texto ainda não passou por revisão de advogado e contém lacunas assinaladas em
            destaque (razão social, CNPJ, foro, encarregado). Ele descreve fielmente o que o sistema
            faz, mas não substitui parecer jurídico e não deve ir ao ar no lançamento sem revisão.
          </span>
        </Aviso>
      </div>

      <div className={estilos.corpo}>
        <aside className={estilos.indice}>
          <nav aria-labelledby="titulo-indice">
            <h2 id="titulo-indice" className={estilos.indiceTitulo}>
              Nesta página
            </h2>
            <ol className={estilos.indiceLista}>
              {doc.secoes.map((secao) => (
                <li key={secao.id}>
                  <a
                    href={`#${secao.id}`}
                    className={secaoAtiva === secao.id ? estilos.indiceLinkAtivo : estilos.indiceLink}
                    aria-current={secaoAtiva === secao.id ? 'true' : undefined}
                  >
                    {secao.titulo}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <main id="conteudo" className={estilos.documento}>
          <div className={estilos.cabecalho}>
            <p className={estilos.eyebrow}>PAUTARIA · DOCUMENTOS LEGAIS</p>
            <h1 className={estilos.titulo}>{doc.titulo}</h1>
            <p className={estilos.subtitulo}>{doc.subtitulo}</p>

            <dl className={estilos.meta}>
              <div className={estilos.metaItem}>
                <dt className={estilos.metaRotulo}>Versão</dt>
                <dd className={estilos.metaValor}>{VERSOES[doc.chave]}</dd>
              </div>
              <div className={estilos.metaItem}>
                <dt className={estilos.metaRotulo}>Vigente desde</dt>
                <dd className={estilos.metaValor}>{formatarDataLonga(VIGENCIA)}</dd>
              </div>
            </dl>

            <div className={estilos.acoes}>
              <Botao variante="secundario" onClick={() => window.print()}>
                Salvar ou imprimir
              </Botao>
            </div>
          </div>

          <section className={estilos.resumo} aria-labelledby="titulo-resumo">
            <h2 id="titulo-resumo" className={estilos.resumoTitulo}>
              Em resumo, sem juridiquês
            </h2>
            {doc.resumo}
            <p className={estilos.resumoNota}>
              Este resumo é orientativo e existe para você não precisar ler tudo para entender o
              essencial. O que vale juridicamente é o texto completo abaixo.
            </p>
          </section>

          {doc.secoes.map((secao) => (
            <section key={secao.id} className={estilos.secao} aria-labelledby={secao.id}>
              <h2 id={secao.id} className={estilos.tituloSecao}>
                {secao.titulo}
              </h2>
              {secao.corpo}
            </section>
          ))}

          <footer className={estilos.rodape}>
            <p className={estilos.rodapeLinha}>
              {doc.titulo} · versão {VERSOES[doc.chave]} · vigente desde{' '}
              {formatarDataLonga(VIGENCIA)}
            </p>
            <nav className={estilos.rodapeLinks} aria-label="Outras páginas">
              <Link to={documento === 'termos' ? '/privacidade' : '/termos'}>
                {documento === 'termos' ? 'Política de Privacidade' : 'Termos de Uso'}
              </Link>
              <Link to="/precos">Preços</Link>
              <Link to="/">Início</Link>
            </nav>
          </footer>
        </main>
      </div>
    </div>
  );
}
