/**
 * checar-transbordo.mjs — encontra quem força rolagem horizontal
 *
 * O transbordo lateral é o defeito de mobile mais comum e o mais difícil de
 * diagnosticar olhando: um único elemento largo demais empurra a largura do
 * documento, e **todo o resto da página** passa a parecer cortado. O sintoma
 * aparece em toda parte; a causa está num lugar só.
 *
 * Este script mede em vez de adivinhar. Abre cada rota na largura de um
 * telefone, percorre o DOM e reporta os elementos cuja borda direita passa da
 * largura da janela — ordenados pelo tanto que passam.
 *
 * Sem dependência nova: o Node 22 traz `WebSocket` nativo, então o protocolo do
 * Chrome DevTools é falado direto.
 *
 * Também captura a tela de cada rota, no mesmo viewport que mediu. As duas
 * coisas moram juntas de propósito: uma captura feita numa largura diferente da
 * medição é pior que nenhuma — foi assim que "defeitos de mobile" inexistentes
 * chegaram a ser diagnosticados aqui.
 *
 * Uso:  npm run dev            # em outro terminal
 *       node scripts/checar-transbordo.mjs [largura]
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';

const LARGURA = Number(process.argv[2] ?? 390);
const ALTURA = 900;
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const PORTA_CDP = 9333;
const SAIDA = process.env.SAIDA ?? '.telas';

const ROTAS = [
  ['landing', '/?demo=1'],
  ['precos', '/precos?demo=1'],
  ['entrar', '/entrar?demo=1'],
  ['criar-conta', '/criar-conta?demo=1'],
  ['termos', '/termos?demo=1'],
  ['privacidade', '/privacidade?demo=1'],
  ['abertura', '/comecar?demo=1'],
  ['quadro', '/w/aurora?demo=1'],
  ['plano', '/w/aurora/plano?demo=1'],
  ['equipe', '/w/aurora/equipe?demo=1'],
  ['configuracoes', '/w/aurora/configuracoes?demo=1'],
  ['arquivadas', '/w/aurora/arquivadas?demo=1'],
  ['atividade', '/w/aurora/atividade?demo=1'],
];

/**
 * Roda dentro da página. Devolve os elementos que ultrapassam a largura da
 * janela, com um seletor legível para cada um.
 *
 * Ignora `position: fixed` — um elemento fixo fora da tela não gera rolagem no
 * documento. E ignora quem está dentro de um contêiner com rolagem própria
 * (`overflow-x: auto|scroll`): o trilho do kanban é largo **de propósito**, e
 * acusá-lo seria ruído.
 */
const DETECTOR = `
(() => {
  const largura = document.documentElement.clientWidth;
  const achados = [];

  function temRolagemPropria(el) {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ov = getComputedStyle(p).overflowX;
      if (ov === 'auto' || ov === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  }

  function descrever(el) {
    const classes = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    const texto = (el.textContent || '').trim().slice(0, 40).replace(/\\s+/g, ' ');
    return el.tagName.toLowerCase() + classes + (texto ? '  «' + texto + '»' : '');
  }

  for (const el of document.querySelectorAll('body *')) {
    const estilo = getComputedStyle(el);
    if (estilo.position === 'fixed' || estilo.display === 'none') continue;
    const caixa = el.getBoundingClientRect();
    if (caixa.width === 0) continue;
    const excesso = Math.round(caixa.right - largura);
    if (excesso > 1 && !temRolagemPropria(el)) {
      achados.push({ excesso, alvo: descrever(el) });
    }
  }

  achados.sort((a, b) => b.excesso - a.excesso);
  return JSON.stringify({
    larguraJanela: largura,
    larguraDocumento: document.documentElement.scrollWidth,
    achados: achados.slice(0, 6),
  });
})()
`;

function acharChromium() {
  try {
    const dir = readdirSync('/opt/pw-browsers').find((d) => d.startsWith('chromium-'));
    if (dir) return `/opt/pw-browsers/${dir}/chrome-linux/chrome`;
  } catch {
    /* segue para o fallback */
  }
  return process.env.CHROME ?? 'chromium';
}

async function cdp(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const aoResponder = (evento) => {
      const msg = JSON.parse(evento.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', aoResponder);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    };
    ws.addEventListener('message', aoResponder);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const navegador = spawn(acharChromium(), [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORTA_CDP}`,
  `--window-size=${LARGURA},${ALTURA}`,
  'about:blank',
], { stdio: 'ignore' });

let saida = 0;

try {
  // Espera o endpoint do depurador responder.
  let pronto = false;
  for (let i = 0; i < 30 && !pronto; i++) {
    await esperar(300);
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`);
      pronto = r.ok;
    } catch {
      /* ainda subindo */
    }
  }
  if (!pronto) throw new Error('Chromium não abriu a porta de depuração.');

  mkdirSync(SAIDA, { recursive: true });
  console.log(`▸ Telas e transbordo em ${LARGURA}px → ${SAIDA}\n`);
  let comProblema = 0;

  for (const [nome, caminho] of ROTAS) {
    const alvo = await (
      await fetch(
        `http://127.0.0.1:${PORTA_CDP}/json/new?${encodeURIComponent(BASE + caminho)}`,
        { method: 'PUT' },
      )
    ).json();

    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));

    // `--window-size` NÃO produz o viewport pedido: o Chromium trava a janela
    // num mínimo de 500px de largura. Medir sem esta linha reporta 500px
    // achando que são 390 — e foi exatamente o que aconteceu na primeira
    // rodada, produzindo "defeitos de mobile" que eram artefato da ferramenta.
    // `setDeviceMetricsOverride` é o único jeito de obter a largura real.
    await cdp(ws, 100, 'Emulation.setDeviceMetricsOverride', {
      width: LARGURA,
      height: ALTURA,
      deviceScaleFactor: 1,
      mobile: LARGURA < 768,
    });
    await cdp(ws, 101, 'Page.navigate', { url: BASE + caminho });

    // Espera por um SINAL, não por um relógio.
    //
    // A versão anterior dormia 2,2 s fixos. Na rota mais pesada o Vite ainda
    // estava transformando módulos, a página era medida vazia — e uma página
    // vazia trivialmente "não transborda". O resultado era um ✓ que não
    // significava nada, e uma captura em branco.
    //
    // É o mesmo modo de falha do bug B1: verde por ausência de conteúdo. Agora
    // a ausência de conteúdo é uma falha explícita.
    let montou = false;
    for (let tentativa = 0; tentativa < 60 && !montou; tentativa++) {
      await esperar(250);
      const { result } = await cdp(ws, 200 + tentativa, 'Runtime.evaluate', {
        expression:
          "(document.getElementById('root')?.children.length ?? 0) > 0" +
          " && document.body.innerText.trim().length > 30",
        returnByValue: true,
      });
      montou = result.value === true;
    }

    if (!montou) {
      comProblema++;
      console.log(`  ✗ ${nome.padEnd(15)} NÃO RENDERIZOU em 15 s (root vazio)`);
      ws.close();
      await fetch(`http://127.0.0.1:${PORTA_CDP}/json/close/${alvo.id}`);
      continue;
    }

    // Uma folga curta depois do sinal: fontes e a última pintura.
    await esperar(400);

    const { result } = await cdp(ws, 1, 'Runtime.evaluate', {
      expression: DETECTOR,
      returnByValue: true,
    });
    const dados = JSON.parse(result.value);

    const transborda = dados.larguraDocumento > dados.larguraJanela + 1;
    if (transborda) {
      comProblema++;
      console.log(
        `  ✗ ${nome.padEnd(15)} documento ${dados.larguraDocumento}px > janela ${dados.larguraJanela}px`,
      );
      for (const a of dados.achados) {
        console.log(`      +${String(a.excesso).padStart(4)}px  ${a.alvo}`);
      }
    } else {
      console.log(`  ✓ ${nome.padEnd(15)} cabe em ${dados.larguraJanela}px`);
    }

    const foto = await cdp(ws, 2, 'Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SAIDA}/${LARGURA}-${nome}.png`, Buffer.from(foto.data, 'base64'));

    ws.close();
    await fetch(`http://127.0.0.1:${PORTA_CDP}/json/close/${alvo.id}`);
  }

  console.log();
  if (comProblema > 0) {
    console.log(`✗ ${comProblema} rota(s) com rolagem horizontal.`);
    saida = 1;
  } else {
    console.log('✓ Nenhuma rota transborda.');
  }
} catch (erro) {
  console.error('ERRO:', erro.message);
  saida = 1;
} finally {
  navegador.kill();
}

process.exit(saida);
