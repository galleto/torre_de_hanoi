/**
 * logic.js — Torre de Hanoi
 *
 * Algoritmo inventado en 1883 por Edouard Lucas.
 * Tardé mas tiempo en escribir estos comentarios
 * que en implementar el juego. Y no me arrepiento.
 *
 * Estado del juego encapsulado aqui abajo.
 * Nada de variables globales sueltas por el HTML.
 * (Aprendes esto despues de debuggear por 3 horas
 * algo que era un typo en el HTML.)
 */

"use strict";

/* ─────────────────────────────────────────
   ESTADO GLOBAL
   Todo lo que el juego necesita recordar.
   Como yo con las contrasenas: poca memoria, mucha importancia.
   ───────────────────────────────────────── */

const state = {
    numDisks:      3,        // discos en juego actualmente
    towers:        [[], [], []], // torre[i] = array de tamanos de disco (base → cima)
    selectedTower: null,     // torre de origen seleccionada (null = ninguna)
    moves:         0,        // contador de movimientos del jugador
    seconds:       0,        // segundos transcurridos
    timerInterval: null,     // referencia al setInterval del reloj
    gameRunning:   false,    // bandera: acepta clicks del usuario o no
};


/* ══════════════════════════════════════════
   NAVEGACION DE VISTAS
   Tres pantallas: splash, instrucciones, juego.
   Un SPA sin framework. Vivimos peligrosamente.
   ══════════════════════════════════════════ */

/**
 * Muestra la pantalla de inicio y detiene el timer si corria.
 * Tambien actualiza los botones de seleccion de discos,
 * porque si no lo hago se quedan en el estado anterior
 * y eso me ha costado mas de un reporte de bug.
 */
function showSplash() {
    stopTimer();
    setView('splash');
    updateDiskBtns();
}

/**
 * Muestra las instrucciones.
 * Optimista yo al creer que alguien las lee antes de jugar.
 */
function showInstructions() {
    setView('instructions');
}

/**
 * Cambia la vista visible. Oculta todo, muestra solo la pedida.
 * @param {string} viewId - id del elemento a mostrar
 */
function setView(viewId) {
    ['splash', 'instructions', 'game'].forEach(id => {
        document.getElementById(id).style.display = id === viewId ? 'block' : 'none';
    });
}


/* ══════════════════════════════════════════
   CONFIGURACION DE DISCOS
   El jugador elige cuanto se quiere frustrar.
   ══════════════════════════════════════════ */

/**
 * Guarda el numero de discos seleccionado y actualiza los botones.
 * @param {number} n - numero de discos (3, 4 o 5)
 */
function selectDisks(n) {
    state.numDisks = n;
    updateDiskBtns();
}

/**
 * Marca como activo el boton que coincide con el numero actual de discos.
 * El resto quedan sin marcar. Logica de tabs de toda la vida.
 */
function updateDiskBtns() {
    document.querySelectorAll('.disk-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.n) === state.numDisks);
    });
}


/* ══════════════════════════════════════════
   INICIO Y RESET DEL JUEGO
   ══════════════════════════════════════════ */

/**
 * Transiciona a la vista de juego e inicializa todo.
 * Se llama desde el splash o las instrucciones.
 */
function startGame() {
    setView('game');
    initGame();
}

/**
 * Inicializa (o reinicia) el estado completo del juego.
 *
 * Las torres se representan como arrays donde el primer elemento
 * es la base (disco mas grande) y el ultimo es la cima.
 * Empujamos con push() y sacamos con pop() — es una pila.
 * Stack de verdad, no el "stack" que le decimos a React + Tailwind.
 */
function initGame() {
    // limpiar estado anterior
    state.towers = [[], [], []];

    // llenar torre A: del mas grande al mas pequeno
    // index 0 = base, ultimo index = cima
    for (let i = state.numDisks; i >= 1; i--) {
        state.towers[0].push(i);
    }

    state.selectedTower = null;
    state.moves         = 0;
    state.seconds       = 0;
    state.gameRunning   = true;

    // resetear UI de stats
    document.getElementById('move-val').textContent  = '0';
    document.getElementById('timer-val').textContent = '0:00';

    // mostrar el minimo teorico: 2^n - 1
    // si alguien logra menos que esto, por favor reportarlo como bug
    const optimal = Math.pow(2, state.numDisks) - 1;
    document.getElementById('optimal-label').textContent = `Optimo: ${optimal} movimientos`;

    setHint('Selecciona una torre de origen', false);

    // reiniciar timer
    stopTimer();
    startTimer();

    // dibujar estado inicial
    renderAll();
    clearSelectedStyle();
}

/**
 * Alias publico para el boton "Reiniciar" en pantalla.
 * Existe porque "resetGame" suena mas amigable en el HTML
 * que "initGame" cuando lo lee alguien mas.
 */
function resetGame() {
    stopTimer();
    initGame();
}


/* ══════════════════════════════════════════
   TEMPORIZADOR
   El reloj que juzga al jugador en silencio.
   ══════════════════════════════════════════ */

/**
 * Arranca el timer. Incrementa segundos cada segundo.
 * Formateo manual de MM:SS porque no quiero importar
 * una libreria de 50kb para dos digitos.
 */
function startTimer() {
    state.timerInterval = setInterval(() => {
        state.seconds++;
        const m = Math.floor(state.seconds / 60);
        const s = state.seconds % 60;
        // padStart: el cero a la izquierda que tanto me gusta
        document.getElementById('timer-val').textContent =
            `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

/**
 * Detiene el timer. Guarda la referencia en null
 * para no intentar limpiar un interval que ya no existe.
 * Ese es el tipo de bug que aparece a las 11pm.
 */
function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}


/* ══════════════════════════════════════════
   LOGICA CENTRAL DEL JUEGO
   Aqui vive la Torre de Hanoi de verdad.
   Todo lo demas es decoracion con pretensiones.
   ══════════════════════════════════════════ */

/**
 * Maneja el click en una torre.
 * Dos modos:
 *   1. Sin seleccion previa  → seleccionar como origen
 *   2. Con seleccion previa  → intentar mover disco
 *
 * @param {number} idx - indice de la torre clickeada (0=A, 1=B, 2=C)
 */
function clickTower(idx) {
    // ignorar clicks si el juego no esta activo
    if (!state.gameRunning) return;

    if (state.selectedTower === null) {
        handleSourceSelection(idx);
    } else {
        handleDestinationSelection(idx);
    }
}

/**
 * Intenta seleccionar una torre como origen del movimiento.
 * Solo valida que no este vacia. Si esta vacia, no hay nada que mover.
 * Concepto revolucionario, lo se.
 *
 * @param {number} idx - torre candidata a origen
 */
function handleSourceSelection(idx) {
    if (state.towers[idx].length === 0) {
        setHint('Esa torre esta vacia', true);
        return;
    }

    state.selectedTower = idx;
    document.getElementById('tower-' + idx).classList.add('selected');
    liftTopDisk(idx, true); // efecto visual de "levantar" el disco
    setHint('Ahora selecciona el destino', false);
}

/**
 * Intenta mover el disco de la torre seleccionada a la torre destino.
 * Valida la regla principal: nunca un disco grande sobre uno pequeno.
 * Si el usuario clickea la misma torre origen, cancela la seleccion.
 *
 * @param {number} idx - torre destino candidata
 */
function handleDestinationSelection(idx) {
    // click en la misma torre = cancelar seleccion
    if (idx === state.selectedTower) {
        cancelSelection();
        return;
    }

    const src = state.selectedTower;

    // disco en la cima del origen (el mas pequeno disponible)
    const topSrc = state.towers[src][state.towers[src].length - 1];

    // disco en la cima del destino (Infinity si esta vacia — cualquier disco cabe)
    const topDst = state.towers[idx].length > 0
        ? state.towers[idx][state.towers[idx].length - 1]
        : Infinity;

    // la unica regla del juego — romperla hace temblar al matemático muerto
    if (topSrc > topDst) {
        setHint('Movimiento invalido — disco mas grande sobre uno menor', true);
        shakeAnimation(idx);
        return;
    }

    // movimiento valido: sacar de origen, meter en destino
    state.towers[idx].push(state.towers[src].pop());
    state.moves++;
    document.getElementById('move-val').textContent = state.moves;

    // limpiar seleccion visual
    cancelSelection();
    setHint('Selecciona una torre de origen', false);

    // re-renderizar el estado actual
    renderAll();

    // verificar condicion de victoria: torre C llena con todos los discos
    if (state.towers[2].length === state.numDisks) {
        state.gameRunning = false;
        stopTimer();
        // pequeno delay para que el ultimo movimiento sea visible antes del modal
        setTimeout(showWin, 380);
    }
}

/**
 * Cancela la seleccion actual sin mover nada.
 * Quita el estilo visual y baja el disco levantado.
 */
function cancelSelection() {
    if (state.selectedTower !== null) {
        document.getElementById('tower-' + state.selectedTower).classList.remove('selected');
        liftTopDisk(state.selectedTower, false);
    }
    clearSelectedStyle();
    state.selectedTower = null;
    setHint('Selecciona una torre de origen', false);
}

/**
 * Quita la clase "selected" de todas las torres.
 * Util para limpiar sin saber cual esta seleccionada.
 */
function clearSelectedStyle() {
    [0, 1, 2].forEach(i => {
        document.getElementById('tower-' + i).classList.remove('selected');
    });
}


/* ══════════════════════════════════════════
   RENDERIZADO
   Del estado al DOM. Solo en una direccion.
   Como deberia ser. Como el agua. Como el tiempo.
   ══════════════════════════════════════════ */

/**
 * Re-dibuja las tres torres segun el estado actual.
 * Destruye y recrea los elementos de disco.
 * Burdo pero efectivo — igual que yo antes del cafe.
 */
function renderAll() {
    [0, 1, 2].forEach(towerIdx => {
        const stack = document.getElementById('stack-' + towerIdx);
        stack.innerHTML = ''; // vaciamos el contenedor

        // los discos en towers[i] van de base a cima,
        // pero en el DOM queremos la base abajo visualmente.
        // como el array ya esta ordenado base→cima y el CSS
        // los apila con flex column, el orden del DOM es correcto.
        state.towers[towerIdx].forEach(size => {
            const disk = document.createElement('div');
            disk.className = `disk size-${size}`;
            stack.appendChild(disk);
        });
    });
}

/**
 * Aplica o quita el efecto de "disco levantado" al disco cima de una torre.
 * Es puramente cosmético — no cambia el estado.
 *
 * @param {number} towerIdx - indice de la torre
 * @param {boolean} on      - true = levantar, false = bajar
 */
function liftTopDisk(towerIdx, on) {
    const stack = document.getElementById('stack-' + towerIdx);
    if (!stack.lastChild) return; // torre vacia, no hay nada que levantar
    stack.lastChild.classList.toggle('lifting', on);
}


/* ══════════════════════════════════════════
   EFECTOS VISUALES
   El 80% del tiempo de desarrollo. El 2% del codigo.
   ══════════════════════════════════════════ */

/**
 * Animacion de shake en la torre destino cuando el movimiento es invalido.
 * Implementado con timeouts porque es 2024 y aun hacemos esto.
 * (Si, se puede con CSS animations. No, no quise complicarlo.)
 *
 * @param {number} idx - torre que "tiembla"
 */
function shakeAnimation(idx) {
    const el = document.getElementById('tower-' + idx);
    el.style.transition = 'transform 0.07s';
    el.style.transform  = 'translateX(5px)';
    setTimeout(() => { el.style.transform = 'translateX(-5px)'; }, 70);
    setTimeout(() => { el.style.transform = 'translateX(3px)';  }, 140);
    setTimeout(() => { el.style.transform = 'translateX(0)';    }, 210);
}

/**
 * Muestra u oculta el mensaje de pista/error debajo del area de juego.
 * Los mensajes de error se auto-borran despues de 1.8 segundos
 * para no dejar al usuario sintiendose mal por mucho tiempo.
 * Soy programador, no terapista, pero algo de empatia hay.
 *
 * @param {string}  msg     - texto a mostrar
 * @param {boolean} isError - true = color rojo + auto-reset
 */
function setHint(msg, isError) {
    const el = document.getElementById('hint-text');
    el.textContent = msg;
    el.className = 'hint-text' + (isError ? ' error' : '');

    if (isError) {
        setTimeout(() => {
            // solo resetear si el mensaje sigue siendo un error
            // (evitar pisar un mensaje nuevo que llego mientras tanto)
            if (el.classList.contains('error')) {
                const nextMsg = state.selectedTower !== null
                    ? 'Ahora selecciona el destino'
                    : 'Selecciona una torre de origen';
                el.textContent = nextMsg;
                el.className   = 'hint-text';
            }
        }, 1800);
    }
}


/* ══════════════════════════════════════════
   MODAL DE VICTORIA
   El usuario lo logro. Lo merecemos celebrar.
   (Con texto. No pusimos emojis. Somos serios aqui.)
   ══════════════════════════════════════════ */

/**
 * Calcula estadisticas finales y muestra el modal de victoria.
 * La eficiencia se calcula como porcentaje del optimo.
 * 100% = solucion perfecta. Cualquier cosa menor = buen intento.
 */
function showWin() {
    const m = Math.floor(state.seconds / 60);
    const s = state.seconds % 60;
    const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

    const optimal = Math.pow(2, state.numDisks) - 1;
    const pct     = Math.round((optimal / state.moves) * 100);

    document.getElementById('win-time').textContent  = timeStr;
    document.getElementById('win-moves').textContent = state.moves;

    document.getElementById('win-efficiency').textContent =
        state.moves === optimal
            ? `Solucion optima · ${optimal} movimientos`
            : `Eficiencia ${pct}% · Optimo: ${optimal} mov.`;

    document.getElementById('win-overlay').classList.add('show');
}

/**
 * Cierra el modal de victoria.
 * Simple. Directo. Como debe ser.
 */
function closeWin() {
    document.getElementById('win-overlay').classList.remove('show');
}


/* ══════════════════════════════════════════
   INICIALIZACION
   Lo ultimo que corre cuando carga la pagina.
   Marca el boton de 3 discos como activo por defecto.
   ══════════════════════════════════════════ */
updateDiskBtns();
