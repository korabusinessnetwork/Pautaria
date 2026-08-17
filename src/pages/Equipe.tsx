/**
 * Equipe — membros e convites.
 *
 * O link do convite aparece **uma vez**, logo depois de criado, com um aviso
 * explícito. Não é limitação técnica disfarçada de feature: guardamos apenas o
 * SHA-256 do token (ver `membros.service.ts`), então o link realmente deixa de
 * existir quando esta tela é fechada. É a mesma escolha que qualquer gerenciador
 * de segredos faz, e pelo mesmo motivo — um convite recuperável a qualquer
 * momento é um convite que vaza junto com o banco.
 */

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProvedorWorkspace, useWorkspace } from '@/context/WorkspaceContext';
import * as membrosService from '@/lib/membros.service';
import { useSessao } from '@/context/SessaoContext';
import { useLimites } from '@/hooks/useLimites';
import { normalizar } from '@/lib/erros';
import { formatarDataCurta } from '@/utils/formato';
import { Avatar } from '@/components/shared/Avatar';
import { Campo } from '@/components/shared/Campo';
import { Botao } from '@/components/shared/Botao';
import { Aviso } from '@/components/shared/Aviso';
import { Carregando } from '@/components/shared/Carregando';
import { NaoEncontrado } from './NaoEncontrado';
import type { Papel } from '@/lib/tipos';
import estilos from './Equipe.module.css';

export function Equipe() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <NaoEncontrado />;
  return (
    <ProvedorWorkspace slug={slug}>
      <Conteudo />
    </ProvedorWorkspace>
  );
}

const ROTULO_PAPEL: Record<Papel, string> = {
  owner: 'Dono',
  admin: 'Admin',
  membro: 'Membro',
};

function Conteudo() {
  const { workspace, podeAdministrar, ehDono, carregando } = useWorkspace();
  const { sessao } = useSessao();
  const cliente = useQueryClient();
  const limites = useLimites();

  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<'admin' | 'membro'>('membro');
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  const consultaMembros = useQuery({
    queryKey: ['membros', workspace?.id],
    queryFn: () => membrosService.listarMembros(workspace!.id),
    enabled: Boolean(workspace?.id),
  });

  const consultaConvites = useQuery({
    queryKey: ['convites', workspace?.id],
    queryFn: () => membrosService.listarConvites(workspace!.id),
    enabled: Boolean(workspace?.id) && podeAdministrar,
  });

  const convite = useMutation({
    mutationFn: () =>
      membrosService.convidar({ workspaceId: workspace!.id, email, papel }),
    onSuccess: (resposta) => {
      setLinkGerado(resposta.link);
      setEmail('');
      setCopiado(false);
      void cliente.invalidateQueries({ queryKey: ['convites', workspace?.id] });
      void cliente.invalidateQueries({ queryKey: ['uso', workspace?.id] });
    },
    onError: (e) => setErro(normalizar(e)),
  });

  const revogacao = useMutation({
    mutationFn: (id: string) => membrosService.revogarConvite(id),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['convites', workspace?.id] });
      void cliente.invalidateQueries({ queryKey: ['uso', workspace?.id] });
    },
    onError: (e) => setErro(normalizar(e)),
  });

  const remocao = useMutation({
    mutationFn: (userId: string) =>
      membrosService.removerMembro(workspace!.id, userId),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['membros', workspace?.id] });
      void cliente.invalidateQueries({ queryKey: ['uso', workspace?.id] });
    },
    onError: (e) => setErro(normalizar(e)),
  });

  const mudanca = useMutation({
    mutationFn: (entrada: { userId: string; papel: Papel }) =>
      membrosService.mudarPapel(workspace!.id, entrada.userId, entrada.papel),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['membros', workspace?.id] }),
    onError: (e) => setErro(normalizar(e)),
  });

  if (carregando) return <Carregando mensagem="Carregando a equipe…" />;
  if (!workspace) return <NaoEncontrado />;

  const membros = consultaMembros.data ?? [];
  const convites = consultaConvites.data ?? [];
  const meuId = sessao?.user.id;

  function enviarConvite(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    convite.mutate();
  }

  return (
    <div className={estilos.tela}>
      <header className={estilos.cabecalho}>
        <Link to={`/w/${workspace.slug}`} className={estilos.voltar}>
          ← Voltar ao quadro
        </Link>
        <h1 className={estilos.titulo}>Equipe</h1>
        <p className={estilos.subtitulo}>
          {membros.length === 1
            ? 'Você é a única pessoa neste workspace.'
            : `${membros.length} pessoas neste workspace.`}
        </p>
      </header>

      {erro ? (
        <div className={estilos.painel}>
          <Aviso erro={erro} aoFechar={() => setErro(null)} linkPlano={`/w/${workspace.slug}/plano`} />
        </div>
      ) : null}

      <section className={estilos.painel}>
        <h2 className={estilos.tituloSecao}>Pessoas</h2>

        <ul className={estilos.lista}>
          {membros.map((membro) => {
            const souEu = membro.userId === meuId;

            return (
              <li key={membro.userId} className={estilos.item}>
                <Avatar
                  iniciais={membro.iniciais}
                  hue={membro.hue}
                  nome={membro.nome}
                  tamanho="grande"
                />
                <span className={estilos.pessoa}>
                  <span className={estilos.nome}>
                    {membro.nome}
                    {souEu ? <span className={estilos.voce}>você</span> : null}
                  </span>
                  <span className={estilos.email}>{membro.email}</span>
                </span>

                {ehDono && !souEu ? (
                  <select
                    className={estilos.select}
                    value={membro.papel}
                    onChange={(e) =>
                      mudanca.mutate({ userId: membro.userId, papel: e.target.value as Papel })
                    }
                    aria-label={`Papel de ${membro.nome}`}
                  >
                    <option value="membro">Membro</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Dono</option>
                  </select>
                ) : (
                  <span className={estilos.papel}>{ROTULO_PAPEL[membro.papel]}</span>
                )}

                {(podeAdministrar && !souEu) || souEu ? (
                  <Botao
                    variante="perigo"
                    onClick={() => remocao.mutate(membro.userId)}
                    motivoDesabilitado={
                      membro.papel === 'owner' && membros.filter((m) => m.papel === 'owner').length === 1
                        ? 'Promova outra pessoa a dono antes de remover o dono atual.'
                        : undefined
                    }
                  >
                    {souEu ? 'Sair' : 'Remover'}
                  </Botao>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {podeAdministrar ? (
        <section className={estilos.painel}>
          <h2 className={estilos.tituloSecao}>Convidar alguém</h2>

          {linkGerado ? (
            <div className={estilos.linkCaixa}>
              <p className={estilos.linkAviso}>
                <strong>Copie agora.</strong> Guardamos só o hash deste token — se você
                fechar esta tela, o link não pode ser recuperado, só revogado e recriado.
              </p>
              <div className={estilos.linkLinha}>
                <code className={estilos.link}>{linkGerado}</code>
                <Botao
                  onClick={() => {
                    void navigator.clipboard.writeText(linkGerado).then(() => setCopiado(true));
                  }}
                >
                  {copiado ? 'Copiado ✓' : 'Copiar'}
                </Botao>
              </div>
              <Botao variante="secundario" onClick={() => setLinkGerado(null)}>
                Já copiei, pode fechar
              </Botao>
            </div>
          ) : (
            <form className={estilos.formulario} onSubmit={enviarConvite}>
              <Campo
                rotulo="E-mail de quem você quer convidar"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                dica="O convite vale por 7 dias e só funciona para este e-mail."
              />

              <label className={estilos.campoPapel}>
                <span className={estilos.rotuloPapel}>Papel</span>
                <select
                  className={estilos.select}
                  value={papel}
                  onChange={(e) => setPapel(e.target.value as 'admin' | 'membro')}
                >
                  <option value="membro">Membro — cria e move pautas</option>
                  <option value="admin">Admin — também gerencia equipe e ofícios</option>
                </select>
              </label>

              <Botao
                type="submit"
                carregando={convite.isPending}
                motivoDesabilitado={
                  limites.convidarMembro.liberado ? undefined : limites.convidarMembro.motivo
                }
              >
                Gerar link de convite
              </Botao>
            </form>
          )}

          {convites.length > 0 ? (
            <div className={estilos.convites}>
              <h3 className={estilos.tituloConvites}>Convites em aberto</h3>
              {convites.map((c) => (
                <div key={c.id} className={estilos.convite}>
                  <span className={estilos.conviteEmail}>{c.email}</span>
                  <span className={estilos.convitePapel}>{ROTULO_PAPEL[c.papel]}</span>
                  <span className={estilos.conviteData}>
                    expira {formatarDataCurta(c.expiraEm)}
                  </span>
                  <Botao variante="perigo" onClick={() => revogacao.mutate(c.id)}>
                    Revogar
                  </Botao>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
