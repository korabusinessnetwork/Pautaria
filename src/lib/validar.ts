/**
 * Validação da fronteira de dados.
 *
 * Toda linha que sai do banco passa por um schema antes de virar estado da UI.
 * O ganho não é teórico: quando uma migration renomeia uma coluna, a alternativa
 * é o React renderizar `undefined` sem reclamar e alguém descobrir dias depois
 * pelo print de um usuário. Aqui a quebra aparece na hora, no console, dizendo
 * qual campo mudou.
 *
 * Em produção, uma linha malformada é **descartada** em vez de derrubar a tela:
 * um quadro com 19 das 20 pautas é ruim; um quadro que não abre é pior.
 *
 * Nota de tipagem: as funções são genéricas sobre o **schema** (`S extends
 * ZodTypeAny`) e não sobre o tipo de saída. Os schemas de `tipos.ts` usam
 * `.transform()` para converter snake_case do banco em camelCase da UI, e um
 * schema com transform tem entrada e saída diferentes — `ZodType<T>` assume que
 * são iguais e recusaria todos eles. Inferir a partir de `S` mantém os dois
 * lados corretos.
 */

import type { TypeOf, ZodTypeAny } from 'zod';
import { ErroApp } from './erros';

export function validarUm<S extends ZodTypeAny>(
  schema: S,
  dado: unknown,
  contexto: string,
): TypeOf<S> {
  const resultado = schema.safeParse(dado);
  if (resultado.success) return resultado.data as TypeOf<S>;

  console.error(`[contrato] ${contexto} fora do schema:`, resultado.error.issues);
  throw new ErroApp(
    'erro_interno',
    'Recebemos um dado em formato inesperado. Recarregue a página.',
    resultado.error,
  );
}

export function validarLista<S extends ZodTypeAny>(
  schema: S,
  dados: unknown[] | null,
  contexto: string,
): Array<TypeOf<S>> {
  if (!dados) return [];

  const validos: Array<TypeOf<S>> = [];
  let descartados = 0;

  for (const item of dados) {
    const resultado = schema.safeParse(item);
    if (resultado.success) {
      validos.push(resultado.data as TypeOf<S>);
    } else {
      descartados++;
      if (descartados === 1) {
        console.error(`[contrato] ${contexto}: item fora do schema`, resultado.error.issues);
      }
    }
  }

  if (descartados > 0) {
    console.error(`[contrato] ${contexto}: ${descartados} item(ns) descartado(s).`);
  }
  return validos;
}
