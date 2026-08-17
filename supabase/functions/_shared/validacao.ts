/**
 * Contratos de entrada — Zod na fronteira.
 *
 * Nenhuma função lê `body.workspaceId` direto. Tudo passa por um schema, e o
 * que não bater com o schema é recusado com `entrada_invalida` antes de tocar o
 * banco ou a Asaas. Não é cerimônia: `workspaceId` é interpolado em consulta e
 * usado em decisão de autorização, e "string qualquer" não é um tipo aceitável
 * para nenhuma das duas coisas.
 */

import { z } from 'zod';
import { ErroApi } from './http.ts';
import { apenasDigitos, documentoValido, telefoneValido } from './documento.ts';

const uuid = z.string().uuid('Identificador inválido.');

export const entradaCriarAssinatura = z.object({
  workspaceId: uuid,
  plano: z.enum(['estudio', 'time'], {
    errorMap: () => ({ message: 'Plano inválido. Use "estudio" ou "time".' }),
  }),
  ciclo: z.enum(['mensal', 'anual']).default('mensal'),
  nomeCobranca: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo de quem será cobrado.')
    .max(120),
  documento: z
    .string()
    .transform(apenasDigitos)
    .refine(documentoValido, 'CPF ou CNPJ inválido. Confira os dígitos.'),
  telefone: z
    .string()
    .transform(apenasDigitos)
    .refine((v) => v === '' || telefoneValido(v), 'Telefone inválido.')
    .optional()
    .default(''),
});

export type EntradaCriarAssinatura = z.infer<typeof entradaCriarAssinatura>;

export const entradaWorkspace = z.object({ workspaceId: uuid });

export const entradaCancelar = z.object({
  workspaceId: uuid,
  motivo: z.string().trim().max(300).optional().default(''),
});

/**
 * Payload do webhook da Asaas.
 *
 * `passthrough()` de propósito: a Asaas adiciona campos ao longo do tempo, e um
 * schema estrito recusaria eventos legítimos numa quinta-feira qualquer por
 * causa de um campo novo que não nos interessa. Validamos com rigor o que
 * usamos e deixamos o resto passar — ele é gravado íntegro em
 * `webhook_eventos.payload` para perícia.
 */
export const eventoAsaas = z
  .object({
    id: z.string().min(1, 'Evento sem identificador.'),
    event: z.string().min(1),
    payment: z
      .object({
        id: z.string(),
        customer: z.string().optional(),
        subscription: z.string().nullish(),
        value: z.number().nonnegative().optional(),
        netValue: z.number().optional(),
        status: z.string().optional(),
        dueDate: z.string().optional(),
        paymentDate: z.string().nullish(),
        clientPaymentDate: z.string().nullish(),
        confirmedDate: z.string().nullish(),
        billingType: z.string().optional(),
        invoiceUrl: z.string().optional(),
        externalReference: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    subscription: z
      .object({
        id: z.string(),
        customer: z.string().optional(),
        status: z.string().optional(),
        nextDueDate: z.string().optional(),
        externalReference: z.string().nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type EventoAsaas = z.infer<typeof eventoAsaas>;

/**
 * Aplica um schema e converte a falha em `ErroApi` com a primeira mensagem
 * legível. Devolver o dump inteiro do Zod ao cliente entregaria a forma interna
 * da API e produziria uma mensagem que ninguém lê.
 */
export function validar<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const resultado = schema.safeParse(entrada);
  if (resultado.success) return resultado.data;

  const primeiro = resultado.error.issues[0];
  const campo = primeiro?.path.join('.') ?? 'entrada';
  const mensagem = primeiro?.message ?? 'Entrada inválida.';

  // Documento inválido tem código próprio: o front destaca o campo do CPF em
  // vez de mostrar um erro genérico de formulário.
  const codigo = campo === 'documento' ? 'documento_invalido' : 'entrada_invalida';
  throw new ErroApi(codigo, mensagem, { campo });
}
