<script>
    // Imagens esperadas em img/
    const IMG = {
      p: "bp.svg", r: "br.svg", n: "bn.svg", b: "bb.svg", q: "bq.svg", k: "bk.svg",
      P: "wp.svg", R: "wr.svg", N: "wn.svg", B: "wb.svg", Q: "wq.svg", K: "wk.svg"
    };

    const boardEl  = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const turnoEl  = document.getElementById('turno');
    const btnReset = document.getElementById('btn-reset');
    const btnUndo  = document.getElementById('btn-undo');

    const botSideSel = document.getElementById('bot-side');
    const botDepthRange = document.getElementById('bot-depth');
    const depthVal = document.getElementById('depth-val');
    const thinkingBadge = document.getElementById('thinking');

    const promoModal   = document.getElementById('promoModal');
    const promoChoices = document.getElementById('promoChoices');

    // Timers
    const timerWhiteEl = document.getElementById('timerWhite');
    const timerBlackEl = document.getElementById('timerBlack');
    const timerMinutesInput = document.getElementById('timer-minutes');
    let whiteTime = 300; // segundos
    let blackTime = 300;
    let timerInterval = null;

    function fmt(sec) {
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return m + ':' + s;
    }
    function updateTimerUI() {
      timerWhiteEl.textContent = fmt(whiteTime);
      timerBlackEl.textContent = fmt(blackTime);
      if (game.game_over()) {
        timerWhiteEl.classList.remove('active');
        timerBlackEl.classList.remove('active');
        return;
      }
      if (timerInterval) { // só destaca ativo quando o relógio estiver rodando
        if (game.turn() === 'w') {
          timerWhiteEl.classList.add('active');
          timerBlackEl.classList.remove('active');
        } else {
          timerBlackEl.classList.add('active');
          timerWhiteEl.classList.remove('active');
        }
      } else {
        timerWhiteEl.classList.remove('active');
        timerBlackEl.classList.remove('active');
      }
    }
    function stopClock() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      updateTimerUI();
    }
    function startClock() {
      if (timerInterval) return;
      timerInterval = setInterval(() => {
        if (game.game_over()) { stopClock(); return; }
        if (game.turn() === 'w') {
          whiteTime = Math.max(0, whiteTime - 1);
          if (whiteTime === 0) return endGameByTime('Pretas');
        } else {
          blackTime = Math.max(0, blackTime - 1);
          if (blackTime === 0) return endGameByTime('Brancas');
        }
        updateTimerUI();
      }, 1000);
      updateTimerUI();
    }
    function resetClocksFromInput() {
      let mins = parseInt(timerMinutesInput.value, 10);
      if (isNaN(mins)) mins = 5;
      mins = Math.max(1, Math.min(60, mins));
      whiteTime = blackTime = mins * 60;
      updateTimerUI();
    }
    function endGameByTime(winner) {
      stopClock();
      statusEl.textContent = 'Tempo esgotado! ' + winner + ' venceram.';
      uiLocked = true;
    }
    timerMinutesInput.addEventListener('input', resetClocksFromInput);

    // Estado do jogo
    const game = new Chess();
    let lastMove = null;
    let dragFrom = null;
    let selected = null;
    let hints = [];
    let pendingPromotion = null;
    let uiLocked = false;

    // Evita “pulo” e listra preta quando o modal abre (bloqueia scroll sem mudar largura do layout)
    let bodyPadRightBackup = '';
    function getScrollbarWidth() {
      const el = document.createElement('div');
      el.style.visibility = 'hidden';
      el.style.overflow = 'scroll';
      el.style.msOverflowStyle = 'scrollbar';
      el.style.position = 'absolute';
      el.style.top = '-9999px';
      el.style.width = '100px';
      el.style.height = '100px';
      document.body.appendChild(el);
      const inner = document.createElement('div');
      inner.style.width = '100%';
      inner.style.height = '200px';
      el.appendChild(inner);
      const width = el.offsetWidth - el.clientWidth;
      document.body.removeChild(el);
      return width;
    }
    function lockScroll() {
      const sw = getScrollbarWidth();
      bodyPadRightBackup = document.body.style.paddingRight || '';
      if (sw > 0) document.body.style.paddingRight = sw + 'px';
      document.body.style.overflow = 'hidden';
    }
    function unlockScroll() {
      document.body.style.overflow = '';
      document.body.style.paddingRight = bodyPadRightBackup;
    }

    function algebraic(r, c) { return String.fromCharCode(97 + c) + (8 - r); }
    function rcFromAlg(sq) { return { c: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1], 10) }; }

    function isPromotionMove(from, to) {
      const piece = game.get(from);
      if (!piece || piece.type !== 'p') return false;
      const destRank = parseInt(to[1], 10);
      return (piece.color === 'w' && destRank === 8) || (piece.color === 'b' && destRank === 1);
    }

    function legalMovesFrom(from) {
      return game.moves({ square: from, verbose: true }).map(m => m.to);
    }

    function openPromotion(color, from, to) {
      pendingPromotion = { from, to, color };
      promoChoices.innerHTML = '';
      const types = ['q','r','b','n'];
      for (const t of types) {
        const key = (color === 'w') ? t.toUpperCase() : t;
        const btn = document.createElement('button');
        const img = document.createElement('img');
        img.src = "img/" + IMG[key];
        img.alt = key;
        btn.appendChild(img);
        btn.addEventListener('click', () => {
          doMove(from, to, t);
          closePromotion();
        });
        promoChoices.appendChild(btn);
      }
      promoModal.classList.add('open');
      lockScroll();
    }
    function closePromotion() {
      pendingPromotion = null;
      promoModal.classList.remove('open');
      unlockScroll();
    }

    function setStatus() {
      turnoEl.textContent = 'Turno: ' + (game.turn() === 'w' ? 'brancas' : 'pretas');
      if (game.in_checkmate()) {
        statusEl.textContent = 'Xeque-mate! ' + (game.turn() === 'w' ? 'Pretas' : 'Brancas') + ' venceram.';
      } else if (game.in_stalemate()) {
        statusEl.textContent = 'Empate por afogamento.';
      } else if (game.in_threefold_repetition()) {
        statusEl.textContent = 'Empate por repetição tripla.';
      } else if (game.insufficient_material()) {
        statusEl.textContent = 'Empate por material insuficiente.';
      } else if (game.in_draw()) {
        statusEl.textContent = 'Empate (50 lances ou posição morta).';
      } else if (game.in_check()) {
        statusEl.textContent = 'Xeque!';
      } else {
        statusEl.textContent = 'Pronto';
      }
    }

    function drawBoard() {
      boardEl.innerHTML = '';
      const b = game.board();

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = document.createElement('div');
          sq.className = 'sq ' + (((r + c) % 2) ? 'dark' : 'light');
          sq.dataset.r = r; sq.dataset.c = c;

          if (lastMove) {
            const a = rcFromAlg(lastMove.from);
            const b2 = rcFromAlg(lastMove.to);
            if ((a.r === r && a.c === c) || (b2.r === r && b2.c === c)) {
              sq.classList.add('last');
            }
          }

          const alg = algebraic(r, c);
          if (hints.includes(alg)) sq.classList.add('hint');

          const piece = b[r][c];
          if (piece) {
            const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
            const img = document.createElement('img');
            img.src = "img/" + IMG[key];
            img.alt = (piece.color === 'w' ? 'Branca ' : 'Preta ') + key.toUpperCase();
            sq.appendChild(img);
          }

          const humanTurn = isHumanTurn();
          sq.draggable = humanTurn && !uiLocked;
          if (humanTurn && !uiLocked) {
            sq.addEventListener('dragstart', (e) => {
              dragFrom = { r: parseInt(sq.dataset.r), c: parseInt(sq.dataset.c) };
              e.dataTransfer.effectAllowed = "move";
              const fromAlg = algebraic(dragFrom.r, dragFrom.c);
              const p = game.get(fromAlg);
              if (!p || p.color !== game.turn()) { dragFrom = null; return; }
              hints = legalMovesFrom(fromAlg);
              drawHintsOnly();
            });
            sq.addEventListener('dragover', (e) => { e.preventDefault(); sq.classList.add('drop-ok'); });
            sq.addEventListener('dragleave', () => { sq.classList.remove('drop-ok'); });
            sq.addEventListener('drop', (e) => {
              e.preventDefault(); sq.classList.remove('drop-ok');
              if (!dragFrom) return;
              tryMoveByRC(dragFrom.r, dragFrom.c, parseInt(sq.dataset.r), parseInt(sq.dataset.c));
              dragFrom = null; hints = [];
            });
            sq.addEventListener('click', () => {
              const r0 = parseInt(sq.dataset.r), c0 = parseInt(sq.dataset.c);
              const here = algebraic(r0, c0);
              if (!selected) {
                const p = game.get(here);
                if (p && p.color === game.turn()) {
                  selected = { r: r0, c: c0 };
                  hints = legalMovesFrom(here);
                  drawBoard();
                }
              } else {
                tryMoveByRC(selected.r, selected.c, r0, c0);
                selected = null; hints = [];
              }
            });
          }

          boardEl.appendChild(sq);
        }
      }
      setStatus();
      updateTimerUI();
      // Não iniciamos o relógio automaticamente aqui para cumprir a regra “só no primeiro lance”
      maybeBotMove(); // pode acionar o primeiro lance do bot
    }

    function drawHintsOnly() {
      const squares = boardEl.querySelectorAll('.sq');
      squares.forEach(sq => {
        const r = parseInt(sq.dataset.r), c = parseInt(sq.dataset.c);
        const alg = algebraic(r, c);
        if (hints.includes(alg)) sq.classList.add('hint'); else sq.classList.remove('hint');
      });
    }

    function tryMoveByRC(r1, c1, r2, c2) {
      const from = algebraic(r1, c1);
      const to   = algebraic(r2, c2);
      const p = game.get(from);
      if (!p || p.color !== game.turn()) { drawBoard(); return; }

      if (isPromotionMove(from, to)) {
        openPromotion(p.color, from, to);
        return;
      }
      doMove(from, to, 'q');
    }

    function doMove(from, to, promotion = 'q') {
      const move = game.move({ from, to, promotion });
      if (move) {
        lastMove = { from: move.from, to: move.to };
        selected = null; hints = [];
        if (!timerInterval) startClock(); // inicia o relógio no primeiro lance válido
        drawBoard();
        checkEnd();
      } else {
        selected = null; hints = [];
        drawBoard();
      }
    }

    function checkEnd() {
      if (game.game_over()) {
        setStatus();
        stopClock();
      }
    }

    // ---------- BOT (Minimax com poda alfa-beta) ----------
// ---------- BOT (Minimax otimizado com heurísticas) ----------

// Valores básicos das peças
const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Pesos para heurísticas adicionais
const kingSafetyWeight = 10;
const centerControlWeight = 20;
const mobilityWeight = 5;

// Casas centrais
const centerSquares = ['d4', 'd5', 'e4', 'e5'];

// Cache para transposição
const transpositionTable = new Map();

// Avaliação mais sofisticada
function evaluateBoard() {
  let score = 0;
  const b = game.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = b[r][c];
      if (!piece) continue;

      let val = pieceValues[piece.type];

      // Bônus por controle do centro
      const sq = algebraic(r, c);
      if (centerSquares.includes(sq)) {
        val += centerControlWeight;
      }

      // Penalidade se o rei estiver exposto (sem peças próximas)
      if (piece.type === 'k') {
        const kingZone = getKingZone(sq);
        const defenders = kingZone.filter(z => {
          const p = game.get(z);
          return p && p.color === piece.color;
        }).length;
        val -= (8 - defenders) * kingSafetyWeight;
      }

      score += (piece.color === 'w') ? val : -val;
    }
  }

  // Mobilidade: mais lances possíveis = melhor
  const mobility = game.moves().length;
  score += (game.turn() === 'w' ? mobility : -mobility) * mobilityWeight;

  return score;
}

// Retorna as casas ao redor do rei
function getKingZone(sq) {
  const { r, c } = rcFromAlg(sq);
  const zone = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        zone.push(algebraic(nr, nc));
      }
    }
  }
  return zone;
}

// Ordena movimentos: capturas e promoções primeiro
function orderMoves(moves) {
  return moves.sort((a, b) => {
    const scoreA = (a.flags.includes('c') ? 10 : 0) + (a.promotion ? 5 : 0);
    const scoreB = (b.flags.includes('c') ? 10 : 0) + (b.promotion ? 5 : 0);
    return scoreB - scoreA;
  });
}

// Quiescence Search
function quiescence(alpha, beta) {
  const standPat = evaluateBoard();
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const moves = orderMoves(game.moves({ verbose: true }).filter(m => m.flags.includes('c')));
  for (const m of moves) {
    game.move(m.san);
    const score = -quiescence(-beta, -alpha);
    game.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function minimax(depth, alpha, beta, maximizing) {
  const hash = game.fen() + depth + maximizing;
  if (transpositionTable.has(hash)) return transpositionTable.get(hash);

  if (depth === 0 || game.game_over()) {
    const evalScore = quiescence(alpha, beta);
    transpositionTable.set(hash, evalScore);
    return evalScore;
  }

  const moves = orderMoves(game.moves({ verbose: true }));
  if (maximizing) {
    let maxEval = -Infinity;
    for (const mv of moves) {
      game.move(mv.san);
      const evalScore = minimax(depth - 1, alpha, beta, false);
      game.undo();
      if (evalScore > maxEval) maxEval = evalScore;
      if (evalScore > alpha) alpha = evalScore;
      if (beta <= alpha) break;
    }
    transpositionTable.set(hash, maxEval);
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const mv of moves) {
      game.move(mv.san);
      const evalScore = minimax(depth - 1, alpha, beta, true);
      game.undo();
      if (evalScore < minEval) minEval = evalScore;
      if (evalScore < beta) beta = evalScore;
      if (beta <= alpha) break;
    }
    transpositionTable.set(hash, minEval);
    return minEval;
  }
}

function bestMoveFor(color, depth) {
  const moves = orderMoves(game.moves({ verbose: true }));
  if (!moves.length) return null;

  let best = null;
  let bestScore = (color === 'w') ? -Infinity : Infinity;

  for (const m of moves) {
    game.move(m.san);
    const score = minimax(depth - 1, -Infinity, Infinity, color !== 'w');
    game.undo();

    if (color === 'w') {
      if (score > bestScore) { bestScore = score; best = m; }
    } else {
      if (score < bestScore) { bestScore = score; best = m; }
    }
  }
  return best;
}


    function isHumanTurn() {
      const botSide = botSideSel.value; // 'none' | 'w' | 'b'
      if (botSide === 'none') return true;
      return game.turn() !== botSide;
    }

    function maybeBotMove() {
      const botSide = botSideSel.value;
      if (botSide === 'none') return;
      if (game.game_over()) return;
      if (game.turn() !== botSide) return;
      if (pendingPromotion) return;
      if (uiLocked) return;

      uiLocked = true;
      thinkingBadge.style.display = '';
      setTimeout(() => {
        const depth = Math.max(1, parseInt(botDepthRange.value, 10) || 2);
        const move = bestMoveFor(botSide, depth);
        if (move) {
          game.move(move.san);
          lastMove = { from: move.from, to: move.to };
          if (!timerInterval) startClock(); // se o bot fizer o primeiro lance, inicia o relógio
        }
        uiLocked = false;
        thinkingBadge.style.display = 'none';
        drawBoard();
        checkEnd();
      }, 50);
    }

    // Eventos
    btnReset.addEventListener('click', () => {
      game.reset();
      lastMove = null; selected = null; hints = [];
      uiLocked = false; thinkingBadge.style.display = 'none';
      resetClocksFromInput();
      stopClock(); // relógio parado até o primeiro lance
      drawBoard();
    });

    btnUndo.addEventListener('click', () => {
      game.undo();
      if (botSideSel.value !== 'none') game.undo();
      lastMove = null; selected = null; hints = [];
      uiLocked = false; thinkingBadge.style.display = 'none';
      drawBoard();
      // Não mexe no relógio aqui; mantém estado atual
    });

    botSideSel.addEventListener('change', () => {
      drawBoard(); // se for vez do bot, ele joga (pode iniciar o relógio se for o primeiro lance)
    });

    botDepthRange.addEventListener('input', () => {
      depthVal.textContent = 'Profundidade: ' + botDepthRange.value;
    });

    // Fechar modal de promoção clicando fora
    promoModal.addEventListener('click', (e) => {
      if (e.target === promoModal) closePromotion();
    });

    // Inicialização (relógio só começa no primeiro lance)
    resetClocksFromInput();
    updateTimerUI();
    drawBoard();
  </script>