/**
 * Preços, página pública.
 *
 * Os planos vêm da tabela `planos`, a mesma que a Edge Function lê para
 * calcular o valor enviado à Asaas. Isso não é elegância de arquitetura: é a
 * garantia de que o preço anunciado e o preço cobrado não têm como divergir.
 * Uma página de preços com valores escritos no JSX é uma promessa que ninguém
 * validou.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listarPlanos } from '@/lib/assinaturas.service';
import { formatarPreco } from '@/utils/formato';
import { useSessao } from '@/context/SessaoContext';
import { Carregando } from '@/components/shared/Carregando';
import { Aviso } from '@/components/shared/Aviso';
import type { Ciclo } from '@/lib/tipos';
import estilos from './Precos.module.css';

export function Precos() {
  const { autenticado } = useSessao();
  const [ciclo, setCiclo] = useState<Ciclo>('mensal');

  const consulta = useQuery({ queryKey: ['planos'], queryFn: listarPlanos });

  if (consulta.isLoading) return <Carregando mensagem="Carregando os planos…" />;

  const planos = consulta.data ?? [];

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <Link to="/" className={estilos.marca}>
          <span className={estilos.bolinha} aria-hidden="true" />
          <span className={estilos.wordmark}>Pautaria</span>
        </Link>

        <h1 className={estilos.titulo}>
          Um preço honesto por <span className={estilos.destaque}>quadro que funciona.</span>
        </h1>
        <p className={estilos.subtitulo}>
          Comece de graça, sem cartão. Assine quando o quadro já fizer parte do seu dia.
        </p>

        <div className={estilos.alternador} role="tablist" aria-label="Ciclo de cobrança">
          <button
            type="button"
            role="tab"
            aria-selected={ciclo === 'mensal'}
            className={ciclo === 'mensal' ? estilos.abaAtiva : estilos.aba}
            onClick={() => setCiclo('mensal')}
          >
            Mensal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ciclo === 'anual'}
            className={ciclo === 'anual' ? estilos.abaAtiva : estilos.aba}
            onClick={() => setCiclo('anual')}
          >
            Anual <span className={estilos.selo}>2 meses grátis</span>
          </button>
        </div>
      </header>

      {consulta.error ? <Aviso erro={consulta.error} /> : null}

      <div className={estilos.planos}>
        {planos.map((plano) => {
          const centavos = ciclo === 'anual' ? plano.precoAnualCentavos : plano.precoMensalCentavos;
          const destaque = plano.chave === 'estudio';

          return (
            <section key={plano.chave} className={destaque ? estilos.cartaoDestaque : estilos.cartao}>
              {destaque ? <span className={estilos.fita}>MAIS ESCOLHIDO</span> : null}

              <h2 className={estilos.nomePlano}>{plano.nome}</h2>
              <p className={estilos.chamada}>{plano.chamada}</p>

              <p className={estilos.preco}>
                {plano.gratuito ? (
                  <span className={estilos.valor}>Grátis</span>
                ) : (
                  <>
                    <span className={estilos.valor}>{formatarPreco(centavos)}</span>
                    <span className={estilos.periodo}>/{ciclo === 'anual' ? 'ano' : 'mês'}</span>
                  </>
                )}
              </p>

              {!plano.gratuito && ciclo === 'anual' ? (
                <p className={estilos.equivalente}>
                  equivale a {formatarPreco(Math.round(centavos / 12))}/mês
                </p>
              ) : null}

              <ul className={estilos.destaques}>
                {plano.destaques.map((item) => (
                  <li key={item}>
                    <span className={estilos.check} aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                to={autenticado ? '/' : '/criar-conta'}
                className={destaque ? estilos.botaoPrincipal : estilos.botaoSecundario}
              >
                {plano.gratuito ? 'Começar grátis' : autenticado ? 'Assinar' : 'Criar conta'}
              </Link>
            </section>
          );
        })}
      </div>

      <footer className={estilos.rodape}>
        <p>
          Pagamento por Pix, boleto ou cartão, processado pela Asaas. O Pautaria nunca vê
          nem guarda dados do seu cartão.
        </p>
        <p>
          Cancele quando quiser, em um clique, e continue usando até o fim do período que
          você já pagou.
        </p>
        <p className={estilos.rodapeLinks}>
          <Link to="/entrar">Entrar</Link> · <Link to="/criar-conta">Criar conta</Link>
        </p>
      </footer>
    </div>
  );
}
