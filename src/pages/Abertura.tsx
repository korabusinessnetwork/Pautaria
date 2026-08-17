/**
 * Abertura — a escolha do ofício.
 *
 * É a tela que define o produto. O usuário chega, escolhe entre três ofícios e
 * cai direto num quadro já tematizado e já povoado. Nada de "dê um nome ao seu
 * projeto", nada de "crie sua primeira coluna": a escolha do ofício **é** a
 * configuração inteira.
 *
 * O nome do workspace é derivado do nome da pessoa em vez de perguntado. Uma
 * pergunta a mais aqui é uma pergunta a mais antes do valor, e o usuário pode
 * renomear depois em dois cliques — a assimetria de custo é evidente.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { listarOficiosDoSistema } from '@/lib/oficios.service';
import { criarWorkspace } from '@/lib/workspaces.service';
import { useSessao } from '@/context/SessaoContext';
import { normalizar } from '@/lib/erros';
import { accentDe } from '@/utils/tema';
import { Carregando } from '@/components/shared/Carregando';
import { Aviso } from '@/components/shared/Aviso';
import estilos from './Abertura.module.css';

export function Abertura() {
  const navegar = useNavigate();
  const { perfil } = useSessao();
  const [criando, setCriando] = useState<string | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  const consulta = useQuery({
    queryKey: ['oficios', 'sistema'],
    queryFn: listarOficiosDoSistema,
  });

  const oficios = consulta.data ?? [];

  async function escolher(chave: string) {
    setErro(null);
    setCriando(chave);
    try {
      const nome = perfil?.nome?.trim().split(/\s+/)[0];
      const { slug } = await criarWorkspace({
        nome: nome ? `Pauta de ${nome}` : 'Minha pauta',
        oficioChave: chave,
      });
      navegar(`/w/${slug}`, { replace: true });
    } catch (e) {
      setErro(normalizar(e));
      setCriando(null);
    }
  }

  if (consulta.isLoading) return <Carregando mensagem="Preparando os ofícios…" />;

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <span className={estilos.eyebrow}>PAUTARIA · SISTEMA DE PAUTA POR OFÍCIO</span>
        <h1 className={estilos.titulo}>
          Toda pauta tem <span className={estilos.destaque}>um sotaque.</span>
        </h1>
        <p className={estilos.subtitulo}>
          Escolha o seu ofício. As etapas, os campos e o ritmo do quadro se ajustam a
          como você trabalha — não o contrário.
        </p>
      </header>

      {erro ? (
        <div className={estilos.faixaErro}>
          <Aviso erro={erro} aoFechar={() => setErro(null)} />
        </div>
      ) : null}

      <div className={estilos.tiles}>
        {oficios.map((oficio) => {
          const accent = accentDe(oficio.hue, oficio.chroma);
          const ocupado = criando === oficio.chave;

          return (
            <button
              key={oficio.id}
              type="button"
              className={estilos.tile}
              disabled={criando !== null}
              onClick={() => void escolher(oficio.chave)}
              style={
                {
                  '--tile-ac': accent.ac,
                  '--tile-soft': accent.acSoft,
                  '--tile-deep': accent.acDeep,
                } as React.CSSProperties
              }
            >
              <span className={estilos.glifo} aria-hidden="true">
                {oficio.glifo}
              </span>
              <span className={estilos.nome}>{oficio.nome}</span>
              <span className={estilos.descricao}>{oficio.descricao}</span>

              <span className={estilos.etapas}>
                {oficio.etapas.slice(0, 4).map((etapa) => (
                  <span
                    key={etapa.id}
                    className={oficio.mono ? estilos.etapaMono : estilos.etapa}
                  >
                    {etapa.nome}
                  </span>
                ))}
              </span>

              {ocupado ? (
                <span className={estilos.montando}>montando seu quadro…</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className={estilos.rodape}>
        Troque de ofício quando quiser — a pauta viaja junto.
      </p>
    </div>
  );
}
