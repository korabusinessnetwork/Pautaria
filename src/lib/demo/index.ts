/**
 * Porta única do modo demonstração.
 *
 * A camada de serviços importa daqui e só daqui — `estado` (o interruptor e o
 * envelope `seDemo`) e `demo` (o banco em memória) chegam pelo mesmo caminho.
 * Um import só por serviço mantém o desvio de demonstração visível como uma
 * linha no topo de cada função, em vez de duas importações que alguém pode
 * separar sem perceber.
 *
 *     import { seDemo, demo } from './demo';
 *
 *     export async function listarPautas(quadroId: string) {
 *       const d = await seDemo(() => demo.pautas(quadroId));
 *       if (d) return d;
 *       …caminho real com supabase…
 *     }
 */

export {
  MARCADOR_DEMO,
  ativarDemo,
  demora,
  desativarDemo,
  estaEmDemo,
  seDemo,
} from './estado';

export * as demo from './dados';
