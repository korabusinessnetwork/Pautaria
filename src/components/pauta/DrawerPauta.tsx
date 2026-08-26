/**
 * Drawer de detalhe.
 *
 * Além de mostrar a pauta, ele é o **caminho acessível de mover** (as pills de
 * MOVER PARA) e a única porta para arquivar. Duas notas de implementação que
 * merecem existir:
 *
 * 1. **Foco preso e devolvido.** Ao abrir, o foco vai para o painel; ao fechar,
 *    volta para o elemento que o abriu. Sem isso, quem navega por teclado fecha
 *    o drawer e é jogado no começo do documento, perdendo o lugar no quadro.
 *
 * 2. **Arquivar pede confirmação.** O CLAUDE.md exige que toda ação destrutiva
 *    seja reversível *ou* confirmada. Arquivar é tecnicamente reversível
 *    (`arquivada_em` volta a nulo), mas não existe UI de desarquivar ainda,
 *    então, até existir, ela é tratada como irreversível e confirma.
 */

import { useEffect, useRef, useState } from 'react';
import { Etiqueta } from '@/components/shared/Etiqueta';
import { Avatar } from '@/components/shared/Avatar';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { formatarDataLonga, formatarPrazo } from '@/utils/formato';
import type { Membro, Oficio, Pauta } from '@/lib/tipos';
import estilos from './DrawerPauta.module.css';

interface Props {
  pauta: Pauta;
  oficio: Oficio;
  membros: Membro[];
  mostrarResponsavel: boolean;
  podeEditar: boolean;
  aoFechar: () => void;
  aoMover: (etapaId: string) => Promise<void>;
  aoEditar: (campos: {
    titulo?: string;
    campo1?: string | null;
    campo2?: string | null;
    prazo?: string | null;
    responsavelId?: string | null;
  }) => Promise<void>;
  aoArquivar: () => Promise<void>;
}

export function DrawerPauta({
  pauta,
  oficio,
  membros,
  mostrarResponsavel,
  podeEditar,
  aoFechar,
  aoMover,
  aoEditar,
  aoArquivar,
}: Props) {
  const painel = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const [confirmandoArquivo, setConfirmandoArquivo] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);

  const [titulo, setTitulo] = useState(pauta.titulo);
  const [campo1, setCampo1] = useState(pauta.campo1 ?? '');
  const [campo2, setCampo2] = useState(pauta.campo2 ?? '');
  const [prazo, setPrazo] = useState(pauta.prazo ?? '');

  useEffect(() => {
    setTitulo(pauta.titulo);
    setCampo1(pauta.campo1 ?? '');
    setCampo2(pauta.campo2 ?? '');
    setPrazo(pauta.prazo ?? '');
    setConfirmandoArquivo(false);
  }, [pauta.id, pauta.titulo, pauta.campo1, pauta.campo2, pauta.prazo]);

  useEffect(() => {
    focoAnterior.current = document.activeElement as HTMLElement | null;
    painel.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      focoAnterior.current?.focus?.();
    };
  }, [aoFechar]);

  const etapaAtual = oficio.etapas.find((e) => e.id === pauta.etapaId);
  const responsavel = membros.find((m) => m.userId === pauta.responsavelId);
  const prazoFmt = formatarPrazo(pauta.prazo);

  async function executar(acao: () => Promise<void>) {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro(e);
    } finally {
      setOcupado(false);
    }
  }

  /** Salva um campo ao sair dele, e só se mudou. */
  function salvarSeMudou(campo: 'titulo' | 'campo1' | 'campo2' | 'prazo', valor: string) {
    const atual = {
      titulo: pauta.titulo,
      campo1: pauta.campo1 ?? '',
      campo2: pauta.campo2 ?? '',
      prazo: pauta.prazo ?? '',
    }[campo];

    if (valor === atual) return;
    if (campo === 'titulo' && !valor.trim()) {
      setTitulo(pauta.titulo);
      return;
    }
    void executar(() => aoEditar({ [campo]: campo === 'titulo' ? valor : valor || null }));
  }

  return (
    <>
      <div className={estilos.fundo} onClick={aoFechar} aria-hidden="true" />

      <div
        ref={painel}
        className={estilos.painel}
        role="dialog"
        aria-modal="true"
        aria-label={`Pauta: ${pauta.titulo}`}
        tabIndex={-1}
      >
        <header className={estilos.cabecalho}>
          <Etiqueta reta>{etapaAtual?.nome ?? 'Etapa'}</Etiqueta>
          <span className={estilos.espacador} />
          <button type="button" className={estilos.fechar} onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </header>

        <textarea
          className={estilos.titulo}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={(e) => salvarSeMudou('titulo', e.target.value)}
          disabled={!podeEditar}
          rows={2}
          maxLength={200}
          aria-label="Título da pauta"
        />

        {erro ? <Aviso erro={erro} aoFechar={() => setErro(null)} /> : null}

        <div className={estilos.campos}>
          <label className={estilos.linha}>
            <span className={estilos.rotulo}>{oficio.campo1Label}</span>
            <input
              className={estilos.valor}
              value={campo1}
              onChange={(e) => setCampo1(e.target.value)}
              onBlur={(e) => salvarSeMudou('campo1', e.target.value)}
              disabled={!podeEditar}
              maxLength={60}
              placeholder="—"
            />
          </label>

          <label className={estilos.linha}>
            <span className={estilos.rotulo}>{oficio.campo2Label}</span>
            <input
              className={estilos.valor}
              value={campo2}
              onChange={(e) => setCampo2(e.target.value)}
              onBlur={(e) => salvarSeMudou('campo2', e.target.value)}
              disabled={!podeEditar}
              maxLength={60}
              placeholder="—"
            />
          </label>

          <label className={estilos.linha}>
            <span className={estilos.rotulo}>Prazo</span>
            <span className={estilos.prazoBloco}>
              <input
                type="date"
                className={estilos.valor}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                onBlur={(e) => salvarSeMudou('prazo', e.target.value)}
                disabled={!podeEditar}
              />
              {prazoFmt.texto ? (
                <span className={prazoFmt.atrasado ? estilos.prazoAtrasado : estilos.prazoNota}>
                  {prazoFmt.atrasado ? `venceu ${prazoFmt.texto}` : prazoFmt.texto}
                </span>
              ) : null}
            </span>
          </label>

          {mostrarResponsavel ? (
            <label className={estilos.linha}>
              <span className={estilos.rotulo}>Responsável</span>
              <span className={estilos.responsavel}>
                {responsavel ? (
                  <Avatar
                    iniciais={responsavel.iniciais}
                    hue={responsavel.hue}
                    nome={responsavel.nome}
                  />
                ) : null}
                <select
                  className={estilos.select}
                  value={pauta.responsavelId ?? ''}
                  onChange={(e) =>
                    void executar(() => aoEditar({ responsavelId: e.target.value || null }))
                  }
                  disabled={!podeEditar}
                  aria-label="Responsável pela pauta"
                >
                  <option value="">Ninguém</option>
                  {membros.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          ) : null}

          {pauta.arquivadaEm ? (
            <div className={estilos.linha}>
              <span className={estilos.rotulo}>Arquivada em</span>
              <span className={estilos.valorEstatico}>
                {formatarDataLonga(pauta.arquivadaEm)}
              </span>
            </div>
          ) : null}
        </div>

        {/* Caminho acessível de mover: o que o arrasto faz com o mouse, estas
            pills fazem com o teclado. */}
        <section className={estilos.mover}>
          <span className={estilos.rotuloSecao}>MOVER PARA</span>
          <div className={estilos.pills}>
            {oficio.etapas.map((etapa) => {
              const ativa = etapa.id === pauta.etapaId;
              return (
                <button
                  key={etapa.id}
                  type="button"
                  className={ativa ? estilos.pillAtiva : estilos.pill}
                  onClick={() => {
                    if (!ativa) void executar(() => aoMover(etapa.id));
                  }}
                  disabled={!podeEditar || ocupado}
                  aria-pressed={ativa}
                >
                  {etapa.nome}
                </button>
              );
            })}
          </div>
        </section>

        <div className={estilos.espacadorVertical} />

        {confirmandoArquivo ? (
          <div className={estilos.confirmacao}>
            <p className={estilos.confirmacaoTexto}>
              Arquivar tira a pauta do quadro. Ela continua guardada, nada é apagado.
            </p>
            <div className={estilos.confirmacaoAcoes}>
              <Botao
                variante="perigo"
                carregando={ocupado}
                onClick={() => void executar(aoArquivar)}
              >
                Sim, arquivar
              </Botao>
              <Botao variante="secundario" onClick={() => setConfirmandoArquivo(false)}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <Botao
            variante="perigo"
            onClick={() => setConfirmandoArquivo(true)}
            motivoDesabilitado={podeEditar ? undefined : 'Workspace em modo somente leitura.'}
          >
            Arquivar pauta
          </Botao>
        )}
      </div>
    </>
  );
}
