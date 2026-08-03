/**
 * @name LovelaceSettings
 * @author Enju
 * @version 1.4.0
 * @description Settings interface for the Lovelace theme. Toggle features and adjust colours without editing CSS.
 * @source https://github.com/Enjuchan/LovelaceSettings/blob/main/LovelaceSettings.plugin.js
 * @updateUrl https://raw.githubusercontent.com/Enjuchan/LovelaceSettings/main/LovelaceSettings.plugin.js
 * @website https://github.com/Enjuchan/LovelaceSettings
 * @license MIT
 */

/* ============================================================================
   AUFBAU
   ----------------------------------------------------------------------------
   Das Plugin schreibt ausschliesslich CSS-Variablen in ein eigenes
   <style>-Element. Es patcht nichts an Discord und fasst das Theme nicht an -
   es setzt nur Werte, die das Theme ohnehin ausliest.

   Daraus folgt: geht das Plugin kaputt oder wird es deaktiviert, faellt das
   Theme auf seine eingebauten Standardwerte zurueck. Nichts bleibt haengen.

   Die Schalter nutzen die --lv-* Variablen aus Lovelace 2.0.0. Aeltere
   Theme-Versionen kennen sie nicht; dann wirken nur Farben und Regler.
   ========================================================================= */

module.exports = meta => {
  const { Data, DOM, React, Patcher, Webpack, UI, Themes } = BdApi;
  const { useState, useCallback, useEffect, useMemo, useRef } = React;
  const jsx = React.createElement;

  const THEME_NAME = 'Lovelace';
  const STYLE_ID = meta.slug + '-vars';

  /* ------------------------------------------------------------------------
     EINSTELLUNGEN
     Jeder Eintrag beschreibt sich selbst. Die Oberflaeche wird daraus erzeugt,
     es gibt also keine zweite Stelle, die man beim Aendern vergessen kann.
     --------------------------------------------------------------------- */

  const defaults = {
    // Schalter
    hearts:          true,
    glow:            true,
    panelCollapse:   true,
    mergedTitlebar:  true,
    listFills:       true,
    fullTimestamps:  true,
    bigPicker:       true,
    // Farben
    glowBlue:        '#5a8cff',
    glowPink:        '#ff5abe',
    // Regler
    panelExpanded:   300,
    panelAlpha:      6,
    listAlpha:       4,
    blurPopup:       6,
    blurList:        0,
    bgBlur:          14,
    bgBrightness:    40,
    spotifyBlur:     9,
    spotifyBright:   50,
    // Text
    bgImage:         '',
    /* Selbst gespeicherte Farben. Beide Farbfelder teilen sich die Liste -
       eine Farbe, die als Blauton taugt, taugt oft auch als Pinkton, und zwei
       getrennte Listen waeren doppelte Pflege fuer denselben Zweck. */
    favColors:       [],
  };

  /* Mehr passen nicht in eine Reihe des Panels, ohne dass sie umbricht. Neue
     Farben verdraengen die aelteste. */
  const MAX_FAVS = 8;

  const TOGGLES = [
    { key: 'hearts',         label: 'Heart-shaped avatars', hint: 'Avatars and server icons as hearts' },
    { key: 'glow',           label: 'Glow',                 hint: 'Breathing glow on panels, servers and DMs' },
    { key: 'panelCollapse',  label: 'Collapsing panel',     hint: 'Bottom-left panel expands on hover' },
    { key: 'mergedTitlebar', label: 'Merged title bar',     hint: 'Window controls in the header row' },
    { key: 'listFills',      label: 'List backgrounds',     hint: 'Light fill behind the sidebars' },
    { key: 'fullTimestamps', label: 'Full timestamps',      hint: 'Written-out time instead of the short form' },
    { key: 'bigPicker',      label: 'Enlarged picker',      hint: 'Emoji and GIF drawer at full height' },
  ];

  const SLIDERS = [
    { key: 'panelExpanded', label: 'Panel width',        min: 200, max: 500, unit: 'px' },
    { key: 'panelAlpha',    label: 'Panel fill',         min: 0,   max: 25,  unit: '%'  },
    { key: 'listAlpha',     label: 'List fill',          min: 0,   max: 25,  unit: '%'  },
    { key: 'blurPopup',     label: 'Blur: menus',        min: 0,   max: 24,  unit: 'px' },
    { key: 'blurList',      label: 'Blur: lists',        min: 0,   max: 24,  unit: 'px' },
    { key: 'bgBlur',        label: 'Background blur',    min: 0,   max: 40,  unit: 'px' },
    { key: 'bgBrightness',  label: 'Background light',   min: 10,  max: 100, unit: '%'  },
    { key: 'spotifyBlur',   label: 'Spotify cover blur', min: 0,   max: 30,  unit: 'px' },
    { key: 'spotifyBright', label: 'Spotify cover light',min: 10,  max: 100, unit: '%'  },
  ];

  const PRESETS = {
    'Lovelace':  { glowBlue: '#5a8cff', glowPink: '#ff5abe' },
    'Frost':     { glowBlue: '#7fd8ff', glowPink: '#c8e9ff' },
    'Ember':     { glowBlue: '#ff9d4d', glowPink: '#ff4d4d' },
    'Moss':      { glowBlue: '#6fe3a1', glowPink: '#d6f56b' },
    'Amethyst':  { glowBlue: '#a06bff', glowPink: '#ff6bd6' },
  };

  const SWATCHES = ['#5a8cff', '#ff5abe', '#7fd8ff', '#ff9d4d',
                    '#6fe3a1', '#a06bff', '#ffd700', '#ffffff'];

  /* ------------------------------------------------------------------------
     HILFSFUNKTIONEN
     --------------------------------------------------------------------- */

  /** #rrggbb + Deckkraft -> rgba(). Ungueltige Eingaben fallen auf Weiss
   *  zurueck, damit ein Tippfehler im Hex-Feld nichts zerschiesst. */
  function rgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    const v = m ? m[1] : 'ffffff';
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function isValidHex(hex) {
    return /^#?([0-9a-f]{6})$/i.test(String(hex).trim());
  }

  function loadSettings() {
    const stored = Data.load(meta.slug, 'settings') || {};
    return { ...defaults, ...stored };
  }

  function saveSettings(settings) {
    Data.save(meta.slug, 'settings', settings);
  }

  /**
   * Baut das komplette Stylesheet aus den Einstellungen.
   *
   * Alles landet in EINEM :root-Block. Werte, die dem Standard entsprechen,
   * werden trotzdem geschrieben - das ist einfacher nachzuvollziehen als eine
   * halb gefuellte Regel, und CSS-Variablen kosten nichts.
   */
  function buildCSS(s) {
    const out = [];

    // --- Farben. Aus einem Hex entstehen beide Stufen: kraeftig fuer Hover
    //     und aktive Zustaende, weich fuer das Grundleuchten. So muss niemand
    //     zwei zusammengehoerende Farben von Hand abstimmen.
    out.push(`--glow-blue: ${rgba(s.glowBlue, 0.9)}`);
    out.push(`--glow-blue-soft: ${rgba(s.glowBlue, 0.35)}`);
    out.push(`--glow-pink: ${rgba(s.glowPink, 0.9)}`);
    out.push(`--glow-pink-soft: ${rgba(s.glowPink, 0.35)}`);

    // --- Flaechen
    out.push(`--panel-color: rgba(255, 255, 255, ${(s.panelAlpha / 100).toFixed(3)})`);
    out.push(`--list-color: rgba(255, 255, 255, ${(s.listAlpha / 100).toFixed(3)})`);
    out.push(`--panel-expanded: ${s.panelExpanded}px`);

    // --- Weichzeichnung
    out.push(`--blur-popup: ${s.blurPopup}px`);
    out.push(`--blur-list: ${s.blurList}px`);
    out.push(`--bg-blur: ${s.bgBlur}px`);
    out.push(`--brightness-bg-image: ${(s.bgBrightness / 100).toFixed(2)}`);

    // --- Spotify
    out.push(`--spotify-cover-blur: ${s.spotifyBlur}px`);
    out.push(`--spotify-cover-brightness: ${(s.spotifyBright / 100).toFixed(2)}`);

    // --- Hintergrundbild. Leer heisst: das Theme behaelt sein eigenes.
    if (s.bgImage.trim()) out.push(`--bg-image: url("${s.bgImage.trim()}")`);

    // --- Schalter. Nur der AUS-Zustand wird geschrieben; ist ein Schalter an,
    //     bleibt die Variable ungesetzt und der Theme-Standard gilt.
    /* Herzform, Panel und Titelleiste laufen NICHT ueber Variablen, sondern
       ueber Klassen am body - siehe applyBodyClasses(). Eine Variable kann
       Werte aendern, aber keine Regel abschalten, und genau das braucht es
       hier: Discords Blob-Masken kommen aus einem Attribut, der eingeklappte
       Panel-Zustand steckt in einem Dutzend Deklarationen, und die
       Titelleiste haengt an mehreren Regeln gleichzeitig. */
    if (!s.glow) {
      out.push('--lv-glow-anim: none');
      out.push('--lv-icon-glow: none');
      out.push('--glow-ring: none');
      out.push('--glow-ring-strong: none');
    }
    if (!s.listFills) {
      out.push('--list-color: transparent');
      out.push('--list-border: transparent');
    }
    if (!s.fullTimestamps) {
      out.push('--lv-timestamp: revert');
      out.push('--lv-timestamp-content: ""');
    }
    if (!s.bigPicker) out.push('--lv-picker: revert');

    /* !important auf JEDER Deklaration ist hier Pflicht.
       BetterDiscord haengt Themes NACH den Plugin-Styles ein. Theme und Plugin
       schreiben beide in :root, haben also dieselbe Spezifitaet - bei
       Gleichstand gewinnt das spaeter Eingehaengte, und das ist das Theme.
       Ohne !important wuerde hier alles korrekt berechnet und dann still
       ueberschrieben. */
    return ':root {\n  ' + out.map(d => d + ' !important').join(';\n  ') + ';\n}';
  }

  /* Schalter, die ganze Regelgruppen abschalten muessen, laufen ueber
     body-Klassen statt ueber Variablen. */
  /* Die Klassen sitzen am html-Element, NICHT am body.
     Discords .visual-refresh liegt ebenfalls am html-Element, und mehrere
     Theme-Regeln bauen darauf auf. Eine Klasse am body koennte diese Regeln
     prinzipiell nie erreichen - html ist kein Nachfahre von body. */
  function applyRootClasses(s) {
    const root = document.documentElement;
    root.classList.toggle('lv-no-hearts', !s.hearts);
    root.classList.toggle('lv-classic-titlebar', !s.mergedTitlebar);
    // Umgekehrte Logik: die Klasse steht fuer "dauerhaft offen"
    root.classList.toggle('lv-panel-open', !s.panelCollapse);
    /* Reicht nicht ueber eine Variable: --lv-glow-anim schaltet nur die
       Atmung ab. Die ruhenden Leuchteffekte stehen als feste Werte in den
       Regeln, die erreicht keine Variable. Deshalb dieselbe Klassenloesung
       wie bei den Herzen. */
    root.classList.toggle('lv-no-glow', !s.glow);
  }

  function clearRootClasses() {
    document.documentElement.classList.remove(
      'lv-no-hearts', 'lv-classic-titlebar', 'lv-panel-open', 'lv-no-glow');
  }

  /* Discord schreibt die Klassenliste des html-Elements gelegentlich komplett
     neu - etwa wenn sich der Aktivitaetsstatus aendert, also bei jedem
     Liedwechsel. Dabei fliegen unsere Klassen mit raus, und abgeschaltete
     Funktionen kamen ploetzlich zurueck.

     Der Beobachter haengt sich an genau dieses eine Attribut und setzt sie
     wieder. Er reagiert nur, wenn tatsaechlich etwas fehlt - sonst wuerde
     jedes Setzen die naechste Mutation ausloesen und sich selbst im Kreis
     drehen. */
  let rootObserver = null;
  let currentSettings = null;

  function startRootObserver() {
    stopRootObserver();
    rootObserver = new MutationObserver(() => {
      if (!currentSettings) return;
      const root = document.documentElement;
      const wanted = {
        'lv-no-hearts':        !currentSettings.hearts,
        'lv-classic-titlebar': !currentSettings.mergedTitlebar,
        'lv-panel-open':       !currentSettings.panelCollapse,
        'lv-no-glow':          !currentSettings.glow,
      };
      const missing = Object.entries(wanted)
        .some(([cls, on]) => root.classList.contains(cls) !== on);
      if (missing) applyRootClasses(currentSettings);
    });
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function stopRootObserver() {
    rootObserver?.disconnect();
    rootObserver = null;
  }

  /* ------------------------------------------------------------------------
     PANELHOEHE MESSEN

     Das Theme haelt unter dem Panel Platz frei, damit die untersten Eintraege
     der Seitenleisten nicht darunter verschwinden. Wie viel noetig ist, haengt
     davon ab, was gerade im Panel steckt - Kontokarte allein sind rund 60px,
     mit Sprachchat, Uebertragung und Spotify werden daraus schnell 370.

     CSS kann die Hoehe eines Geschwisterelements nicht auslesen. Geschaetzte
     Werte lagen um mehr als das Doppelte daneben, und einzelne Bestandteile
     tauchten in keiner Annahme auf. Also gemessen statt geraten: der Beobachter
     schreibt die echte Hoehe als Variable, das Theme rechnet damit.

     Nur fuer den dauerhaft offenen Zustand relevant. Klappt das Panel per
     Hover auf, bleibt der Abstand bewusst unveraendert - ihn mitwachsen zu
     lassen hiesse, das Layout der Listen bei jeder Mausbewegung zu aendern.
     --------------------------------------------------------------------- */

  let panelResizeObserver = null;
  let panelMutationObserver = null;
  let panelNachmessen = null;

  function findePanel() {
    return document.querySelector('[class*="sidebar_"] [class*="panels_"]');
  }

  let letzteHoehe = 0;

  /* Der Wert landet in einem EIGENEN Stylesheet, nicht als Inline-Style am
     html-Element.

     Discord schreibt dessen style-Attribut beim Fokuswechsel komplett neu -
     dasselbe Verhalten wie bei der Klassenliste, siehe rootObserver. Die
     Variable war danach schlicht weg, der Abstand fiel auf den Rueckfallwert
     und die Liste lag wieder unter dem Panel. Sichtbar wurde das, sobald man
     Discord verliess: schon ein Klick in die Konsole genuegte.

     Ein Stylesheet fasst Discord nicht an. */
  function schreibePanelHoehe(el) {
    if (!el) return;
    /* Aufgerundet: ein halber Pixel Rest laesst den letzten Eintrag sonst
       genau an der Kante kleben. */
    const h = Math.ceil(el.getBoundingClientRect().height);
    /* Hoehe 0 heisst versteckt oder noch nicht gerendert - dann lieber den
       letzten brauchbaren Wert behalten. */
    if (h <= 0 || h === letzteHoehe) return;
    letzteHoehe = h;
    DOM.addStyle(meta.slug + '-panelheight', `:root { --lv-panel-height: ${h}px; }`);
  }

  let beobachtetesPanel = null;

  function startPanelObserver() {
    stopPanelObserver();

    /* Haengt sich an das aktuelle Panel - und nur dann neu, wenn es ein
       anderes ist als beim letzten Mal. */
    const beobachte = () => {
      const panel = findePanel();
      if (!panel || panel === beobachtetesPanel) return;

      beobachtetesPanel = panel;
      panelResizeObserver?.disconnect();
      panelResizeObserver = new ResizeObserver(() => schreibePanelHoehe(panel));
      panelResizeObserver.observe(panel);
      schreibePanelHoehe(panel);
    };

    beobachte();

    /* Der Beobachter laeuft DAUERHAFT, nicht nur bis das Panel einmal gefunden
       ist. Discord baut es bei Tab- und Serverwechseln komplett neu auf; der
       ResizeObserver zeigte dann auf ein Element, das nicht mehr im Dokument
       haengt, und meldete nie wieder etwas. Die Hoehe blieb auf dem alten Wert
       stehen, und die Liste lag wieder unter dem Panel.

       Ein einzelner MutationObserver auf den body ist billig, solange der
       Rueckruf nur vergleicht und im Normalfall sofort aussteigt. */
    panelMutationObserver = new MutationObserver(beobachte);
    panelMutationObserver.observe(document.body, { childList: true, subtree: true });

    /* Nachmessen, sobald das Fenster zurueckkommt.

       Ist Discord im Hintergrund, misst der Browser versteckte Elemente mit
       Hoehe 0 und haelt Layoutberechnungen zurueck. Der Beobachter feuert dann
       entweder gar nicht oder mit einem unbrauchbaren Wert - nach dem
       Zurueckwechseln stand der Abstand deshalb auf einem alten Stand und die
       Liste lag wieder unter dem Panel.

       Der Aufschub um einen Frame ist noetig, weil unmittelbar beim Fokuswechsel
       noch die alten Masse gelten. */
    panelNachmessen = () => {
      requestAnimationFrame(() => {
        beobachtetesPanel = null;   /* erzwingt ein Neuanhaengen */
        beobachte();
      });
    };
    window.addEventListener('focus', panelNachmessen);
    document.addEventListener('visibilitychange', panelNachmessen);
  }

  function stopPanelObserver() {
    panelResizeObserver?.disconnect();
    panelResizeObserver = null;
    panelMutationObserver?.disconnect();
    panelMutationObserver = null;
    if (panelNachmessen) {
      window.removeEventListener('focus', panelNachmessen);
      document.removeEventListener('visibilitychange', panelNachmessen);
      panelNachmessen = null;
    }
    beobachtetesPanel = null;
    letzteHoehe = 0;
    DOM.removeStyle(meta.slug + '-panelheight');
  }

  function applySettings(s) {
    currentSettings = s;
    DOM.addStyle(STYLE_ID, buildCSS(s));
    applyRootClasses(s);
  }

  /* ------------------------------------------------------------------------
     OBERFLAECHE
     Bewusst im selben Stil wie DynamicBackgrounds: beschriftete Zeilen,
     Chips fuer Zustaende, Regler mit Zuruecksetzen-Knopf.
     --------------------------------------------------------------------- */

  function useSettings() {
    const [settings, setSettings] = useState(loadSettings);
    useEffect(() => {
      saveSettings(settings);
      applySettings(settings);
    }, [settings]);
    return [settings, setSettings];
  }

  function Toggle({ label, hint, value, onChange }) {
    return jsx('button', {
      className: 'LovelaceSettings-toggle' + (value ? ' active' : ''),
      title: hint,
      onClick: onChange,
      children: [
        jsx('span', { key: 'i', className: 'LovelaceSettings-dot' }),
        jsx('span', { key: 'l', className: 'LovelaceSettings-toggleLabel', children: [
          jsx('span', { key: 'a', className: 'LovelaceSettings-toggleName' }, label),
          jsx('span', { key: 'b', className: 'LovelaceSettings-toggleHint' }, hint),
        ] }),
      ]
    });
  }

  function Slider({ label, value, min, max, unit, def, onChange }) {
    return jsx('div', {
      className: 'LovelaceSettings-slider',
      children: [
        jsx('div', { key: 'head', className: 'LovelaceSettings-sliderHead', children: [
          jsx('span', { key: 'l' }, label),
          jsx('span', { key: 'v', className: 'LovelaceSettings-value' }, value + unit),
          /* Zuruecksetzen erscheint nur bei Abweichung - ein Knopf, der nichts
             bewirkt, ist nur Ballast, und so sieht man auf einen Blick, was
             man ueberhaupt verstellt hat. */
          value !== def ? jsx('button', {
            key: 'r',
            className: 'LovelaceSettings-reset',
            title: 'Reset to ' + def + unit,
            onClick: () => onChange(def),
            children: '\u21ba'
          }) : null,
        ] }),
        jsx('input', {
          key: 'input',
          type: 'range',
          min, max, step: 1,
          value,
          className: 'LovelaceSettings-range',
          onMouseDown: e => e.stopPropagation(),
          onChange: e => onChange(Number(e.target.value)),
        }),
      ]
    });
  }

  /* Discord hoert global auf Tastendruecke - fuer Schnellsuche und Kuerzel.
     In einem Eingabefeld innerhalb der Toolbar bedeutet das: die Zeichen
     kommen nie an. Diese Handler stoppen die Ereignisse am Feld, bevor
     Discord sie sieht. Escape bleibt durchlaessig, damit sich das Popout
     weiterhin schliessen laesst. */
  const inputGuards = {
    onKeyDown:  e => { if (e.key !== 'Escape') e.stopPropagation(); },
    onKeyUp:    e => e.stopPropagation(),
    onKeyPress: e => e.stopPropagation(),
    onMouseDown: e => e.stopPropagation(),
    onClick:    e => e.stopPropagation(),
  };

  function ColorField({ label, value, def, onChange, favorites, onSaveFav, onDropFav }) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const valid = isValidHex(text);

    const istGespeichert = favorites.some(c => c.toLowerCase() === value.toLowerCase());

    return jsx('div', {
      className: 'LovelaceSettings-color',
      children: [
        jsx('div', { key: 'head', className: 'LovelaceSettings-sliderHead', children: [
          jsx('span', { key: 'l' }, label),
          jsx('span', { key: 'p', className: 'LovelaceSettings-preview',
                        style: { background: valid ? text : 'transparent' } }),
          value.toLowerCase() !== def.toLowerCase() ? jsx('button', {
            key: 'r',
            className: 'LovelaceSettings-reset',
            title: 'Reset to ' + def,
            onClick: () => onChange(def),
            children: '\u21ba'
          }) : null,
        ] }),
        jsx('div', { key: 'sw', className: 'LovelaceSettings-swatches',
          children: SWATCHES.map(c => jsx('button', {
            key: c,
            className: 'LovelaceSettings-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' active' : ''),
            style: { background: c },
            title: c,
            onClick: () => onChange(c),
          }))
        }),

        /* Gespeicherte Farben. Eigene Reihe, damit die festen Vorgaben oben
           erkennbar bleiben und nicht mit den eigenen verschwimmen. */
        favorites.length ? jsx('div', {
          key: 'fav',
          className: 'LovelaceSettings-swatches LovelaceSettings-favRow',
          children: favorites.map(c => jsx('button', {
            key: c,
            className: 'LovelaceSettings-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' active' : ''),
            style: { background: c },
            title: c + '  (Right-click to remove)',
            onClick: () => onChange(c),
            /* Entfernen per Rechtsklick statt ueber ein X auf jedem Feld:
               bei 14px Kantenlaenge waere das Kreuz groesser als die Farbe. */
            onContextMenu: e => { e.preventDefault(); e.stopPropagation(); onDropFav(c); },
          }))
        }) : null,

        jsx('div', { key: 'row', className: 'LovelaceSettings-colorRow', children: [
          /* Der native Farbwaehler wurde hier frueher bewusst weggelassen, weil
             er vom Betriebssystem gezeichnet wird und sich keinem Theme
             anpasst. Er ist aber der einzige Weg, eine Farbe zu SUCHEN statt
             sie zu kennen - deshalb jetzt als kleiner Knopf daneben, waehrend
             das Hex-Feld fuer bekannte Werte bleibt. */
          jsx('input', {
            key: 'pick',
            type: 'color',
            value: valid ? (text.startsWith('#') ? text : '#' + text) : def,
            className: 'LovelaceSettings-picker',
            title: 'Pick a colour',
            onChange: e => onChange(e.target.value),
          }),
          jsx('input', {
            key: 'hex',
            type: 'text',
            spellCheck: false,
            value: text,
            placeholder: '#rrggbb',
            className: 'LovelaceSettings-hex' + (valid ? '' : ' invalid'),
            ...inputGuards,
            onChange: e => {
              setText(e.target.value);
              if (isValidHex(e.target.value)) {
                const v = e.target.value.trim();
                onChange(v.startsWith('#') ? v : '#' + v);
              }
            },
          }),
          jsx('button', {
            key: 'save',
            className: 'LovelaceSettings-favAdd' + (istGespeichert ? ' active' : ''),
            title: istGespeichert ? 'Already saved' : 'Save this colour',
            disabled: !valid || istGespeichert,
            onClick: () => onSaveFav(value),
            children: istGespeichert ? '\u2605' : '\u2606',
          }),
        ] }),
      ]
    });
  }

  function SettingsPanel({ onRequestClose }) {
    const [settings, setSettings] = useSettings();
    const set = useCallback((key, value) =>
      setSettings(prev => ({ ...prev, [key]: value })), [setSettings]);

    /* Neue Farbe vorn einreihen, damit die zuletzt gespeicherte zuerst steht.
       Doppelte werden vorher entfernt - sonst waere dieselbe Farbe mehrfach
       in der Reihe, sobald man sie erneut speichert. */
    const saveFav = useCallback(c => setSettings(prev => ({
      ...prev,
      favColors: [c, ...(prev.favColors || []).filter(x => x.toLowerCase() !== c.toLowerCase())]
        .slice(0, MAX_FAVS),
    })), [setSettings]);

    const dropFav = useCallback(c => setSettings(prev => ({
      ...prev,
      favColors: (prev.favColors || []).filter(x => x.toLowerCase() !== c.toLowerCase()),
    })), [setSettings]);

    const themeOn = Themes.isEnabled(THEME_NAME);

    const applyPreset = useCallback(name => {
      const p = PRESETS[name];
      if (p) setSettings(prev => ({ ...prev, ...p }));
    }, [setSettings]);

    const resetAll = useCallback(() => {
      if (confirm('Reset all Lovelace settings to their defaults?')) {
        setSettings({ ...defaults });
      }
    }, [setSettings]);

    return jsx('div', {
      className: 'LovelaceSettings-panel',
      children: [

        jsx('div', { key: 'head', className: 'LovelaceSettings-header', children: [
          jsx('span', { key: 't', className: 'LovelaceSettings-title' }, 'Lovelace'),
          jsx('button', {
            key: 'r',
            className: 'LovelaceSettings-headerButton',
            title: 'Reset everything to defaults',
            onClick: resetAll,
            children: 'Reset all'
          }),
        ] }),

        /* Ohne aktives Theme setzt das Plugin zwar Variablen, aber niemand
           liest sie aus. Das gehoert gesagt, sonst sucht man den Fehler
           bei sich. */
        !themeOn ? jsx('div', { key: 'warn', className: 'LovelaceSettings-warning' },
          'The Lovelace theme is not enabled. These settings will have no effect until you turn it on under Settings \u2192 Themes.') : null,

        jsx('div', { key: 'sec1', className: 'LovelaceSettings-sectionLabel' }, 'Features'),
        jsx('div', { key: 'toggles', className: 'LovelaceSettings-toggles',
          children: TOGGLES.map(t => jsx(Toggle, {
            key: t.key,
            label: t.label,
            hint: t.hint,
            value: settings[t.key],
            onChange: () => set(t.key, !settings[t.key]),
          }))
        }),

        jsx('div', { key: 'sec2', className: 'LovelaceSettings-sectionLabel' }, 'Colours'),
        jsx('div', { key: 'presets', className: 'LovelaceSettings-presets',
          children: Object.keys(PRESETS).map(name => jsx('button', {
            key: name,
            className: 'LovelaceSettings-preset',
            onClick: () => applyPreset(name),
            children: name,
          }))
        }),
        jsx(ColorField, {
          key: 'blue', label: 'Glow, cool tone',
          value: settings.glowBlue, def: defaults.glowBlue,
          onChange: v => set('glowBlue', v),
          favorites: settings.favColors, onSaveFav: saveFav, onDropFav: dropFav,
        }),
        jsx(ColorField, {
          key: 'pink', label: 'Glow, warm tone',
          value: settings.glowPink, def: defaults.glowPink,
          onChange: v => set('glowPink', v),
          favorites: settings.favColors, onSaveFav: saveFav, onDropFav: dropFav,
        }),

        jsx('div', { key: 'sec3', className: 'LovelaceSettings-sectionLabel' }, 'Background'),
        jsx('input', {
          key: 'bgimg',
          type: 'text',
          spellCheck: false,
          value: settings.bgImage,
          placeholder: 'Image URL \u2014 leave empty to keep the theme default',
          className: 'LovelaceSettings-text',
          ...inputGuards,
          onChange: e => set('bgImage', e.target.value),
        }),

        jsx('div', { key: 'sec4', className: 'LovelaceSettings-sectionLabel' }, 'Adjustments'),
        ...SLIDERS.map(sl => jsx(Slider, {
          key: sl.key,
          label: sl.label,
          value: settings[sl.key],
          def: defaults[sl.key],
          min: sl.min, max: sl.max, unit: sl.unit,
          onChange: v => set(sl.key, v),
        })),

      ]
    });
  }

  /* ------------------------------------------------------------------------
     KNOPF IN DER TOOLBAR
     Derselbe Patch wie bei DynamicBackgrounds, damit beide Knoepfe
     nebeneinander landen statt sich zu verdraengen.
     --------------------------------------------------------------------- */

  const constants = { toolbarClasses: {}, Tooltip: null };

  const heartIcon = () => jsx('svg', {
    width: 24, height: 24, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    children: jsx('path', {
      d: 'M12 20.5S4 15.4 4 10.2A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 2.2c0 5.2-8 10.3-8 10.3z'
    })
  });

  /* Eigenes Popout statt Discords Baustein.

     Der interne Popout-Baustein liess sich nicht zum Oeffnen bewegen - kein
     Fehler in der Console, einfach keine Reaktion. Statt weiter in eine
     Blackbox hineinzuraten, ist das hier selbst gebaut: ein fest
     positioniertes div, dessen Koordinaten aus der Position des Knopfes
     kommen.

     Nebeneffekt: keinerlei Abhaengigkeit von Discords Interna. Das Popout
     kann durch kein Discord-Update kaputtgehen. */
  function PopoutComponent() {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, right: 0 });
    const buttonRef = useRef(null);
    const panelRef = useRef(null);

    const themeOn = Themes.isEnabled(THEME_NAME);

    const toggle = useCallback(e => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setOpen(prev => {
        if (!prev && buttonRef.current) {
          const r = buttonRef.current.getBoundingClientRect();
          setPos({
            top: Math.round(r.bottom + 8),
            right: Math.round(window.innerWidth - r.right),
          });
        }
        return !prev;
      });
    }, []);

    /* Schliessen bei Klick daneben und bei Escape. Der Listener haengt am
       document und wird nur registriert, solange das Panel offen ist. */
    useEffect(() => {
      if (!open) return;
      const onDown = e => {
        if (panelRef.current?.contains(e.target)) return;
        if (buttonRef.current?.contains(e.target)) return;
        setOpen(false);
      };
      const onKey = e => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('keydown', onKey, true);
      return () => {
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
      };
    }, [open]);

    if (!themeOn) return null;

    /* Der Knopf einmal beschrieben, damit die Fassung mit und ohne Tooltip
       nicht auseinanderlaufen koennen. */
    const knopf = (zusatz = {}) => jsx('button', {
      ...zusatz,
      ref: buttonRef,
      className: 'LovelaceSettings-toolbarButton' + (open ? ' active' : ''),
      'aria-label': 'Lovelace Settings',
      title: constants.Tooltip ? undefined : 'Lovelace Settings',
      onClick: toggle,
      children: heartIcon(),
    });

    return jsx(React.Fragment, null,
      constants.Tooltip
        ? jsx(constants.Tooltip, {
            text: 'Lovelace Settings',
            position: 'bottom',
            spacing: 8,
            color: 'primary',
            hideOnClick: true,
            /* Discord reicht hier die Hover-Handler herein. onContextMenu
               fliegt raus - sonst schluckt der Tooltip den Rechtsklick. */
            children: ({ onContextMenu, ...tooltipProps }) => knopf(tooltipProps),
          })
        : knopf(),
      open ? jsx('div', {
        ref: panelRef,
        className: 'LovelaceSettings-popout',
        style: { top: pos.top + 'px', right: pos.right + 'px' },
        children: jsx(SettingsPanel, { onRequestClose: () => setOpen(false) }),
      }) : null
    );
  }

  /* ------------------------------------------------------------------------
     STYLESHEET DER OBERFLAECHE
     --------------------------------------------------------------------- */

  function panelCSS() {
    return `
.LovelaceSettings-toolbarButton {
  background: none; border: none; cursor: pointer; padding: 0 4px;
  color: var(--interactive-normal, rgba(255,255,255,0.7));
  transition: color 120ms ease;
}
.LovelaceSettings-toolbarButton:hover { color: var(--interactive-active, #fff); }

/* Das selbst gebaute Popout. z-index hoch genug, um ueber Discords eigenen
   Ebenen zu liegen, aber unter Modals. */
.LovelaceSettings-popout {
  position: fixed;
  z-index: 1002;
  animation: LovelaceSettings-in 140ms cubic-bezier(0.2, 0.7, 0.3, 1);
}
@keyframes LovelaceSettings-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.LovelaceSettings-toolbarButton.active { color: #ff5abe; }

/* Der Hintergrund ist bewusst eine feste Farbe und KEINE Discord-Variable.
   Frueher stand hier var(--background-surface-high) - genau die Variable setzt
   Lovelace aber auf rgba(255,255,255,0.15), also fast durchsichtig. Das Panel
   uebernahm damit die Milchglas-Optik des Themes, und der Chat dahinter war
   durch die Einstellungen hindurch zu lesen.

   Discords eigene Popouts sind undurchsichtig, deshalb faellt das bei
   DynamicBackgrounds nicht auf: das nutzt Discords Popout-Komponente und
   bringt deren Hintergrund mit. Dieses Panel ist selbst gebaut und muss ihn
   selbst liefern. #232428 ist der Ton, den Discord fuer Popouts verwendet. */
.LovelaceSettings-panel {
  width: 340px; max-height: 70vh; overflow-y: auto;
  padding: 14px 16px 18px;
  border-radius: 12px;
  background: #232428;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  color: var(--text-normal, #fff);
  font-size: 13px;
}
/* Farbwaehler, Hex-Feld und Speichern-Stern in einer Zeile. */
.LovelaceSettings-colorRow {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
}
.LovelaceSettings-colorRow .LovelaceSettings-hex { flex: 1; margin-top: 0; }

/* Der native Farbwaehler bringt einen eigenen Rahmen und Innenabstand mit,
   die je nach System anders aussehen. Beides wird weggeraeumt, uebrig bleibt
   die Farbflaeche - damit faellt der Knopf nicht aus dem Panel heraus. */
.LovelaceSettings-picker {
  width: 26px; height: 26px; padding: 0; flex: none;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 6px; background: none; cursor: pointer;
}
.LovelaceSettings-picker::-webkit-color-swatch-wrapper { padding: 2px; }
.LovelaceSettings-picker::-webkit-color-swatch { border: none; border-radius: 4px; }
.LovelaceSettings-picker:hover { border-color: rgba(255,255,255,0.35); }

.LovelaceSettings-favAdd {
  width: 26px; height: 26px; flex: none; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.16); border-radius: 6px;
  background: transparent; color: rgba(255,255,255,0.65);
  font-size: 14px; line-height: 1;
  transition: color 120ms ease, border-color 120ms ease;
}
.LovelaceSettings-favAdd:hover:not(:disabled) {
  color: #ffd700; border-color: rgba(255,215,0,0.45);
}
.LovelaceSettings-favAdd.active { color: #ffd700; border-color: rgba(255,215,0,0.35); }
.LovelaceSettings-favAdd:disabled { cursor: default; }

/* Abgesetzt von der Reihe darueber, damit die festen Vorgaben und die eigenen
   Farben nicht wie eine einzige lange Reihe wirken. */
.LovelaceSettings-favRow {
  margin-top: 6px; padding-top: 6px;
  border-top: 1px dashed rgba(255,255,255,0.10);
}

.LovelaceSettings-panel::-webkit-scrollbar { width: 8px; }
.LovelaceSettings-panel::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.14); border-radius: 4px;
}

.LovelaceSettings-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.LovelaceSettings-title { font-size: 15px; font-weight: 600; }
.LovelaceSettings-headerButton {
  height: 26px; padding: 0 10px; font-size: 12px; cursor: pointer;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
  background: transparent; color: var(--interactive-normal, rgba(255,255,255,0.7));
  transition: background-color 120ms ease, color 120ms ease;
}
.LovelaceSettings-headerButton:hover {
  background: rgba(255,255,255,0.08); color: #fff;
}

.LovelaceSettings-warning {
  margin-bottom: 12px; padding: 8px 10px; border-radius: 8px;
  background: rgba(250,166,26,0.10);
  border: 1px solid rgba(250,166,26,0.35);
  color: #faa61a; font-size: 12px; line-height: 1.45;
}

.LovelaceSettings-sectionLabel {
  margin: 16px 0 8px; font-size: 11px; letter-spacing: 0.05em;
  text-transform: uppercase; white-space: nowrap;
  color: var(--text-muted, rgba(255,255,255,0.38));
}
.LovelaceSettings-sectionLabel:first-of-type { margin-top: 4px; }

.LovelaceSettings-toggles { display: flex; flex-direction: column; gap: 4px; }
.LovelaceSettings-toggle {
  display: flex; align-items: flex-start; gap: 10px;
  width: 100%; padding: 7px 9px; cursor: pointer; text-align: left;
  border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: inherit;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.LovelaceSettings-toggle:hover { background: rgba(255,255,255,0.05); }
.LovelaceSettings-toggle.active { border-color: rgba(255,255,255,0.10); }
.LovelaceSettings-dot {
  flex: 0 0 auto; width: 9px; height: 9px; margin-top: 4px;
  border-radius: 50%; background: rgba(255,255,255,0.16);
  transition: background-color 140ms ease, box-shadow 140ms ease;
}
.LovelaceSettings-toggle.active .LovelaceSettings-dot {
  background: #ff5abe; box-shadow: 0 0 8px 1px rgba(255,90,190,0.55);
}
.LovelaceSettings-toggleLabel { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.LovelaceSettings-toggleName { font-size: 13px; }
.LovelaceSettings-toggle.active .LovelaceSettings-toggleName { color: #fff; }
.LovelaceSettings-toggleHint {
  font-size: 11px; line-height: 1.35;
  color: var(--text-muted, rgba(255,255,255,0.38));
}

.LovelaceSettings-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.LovelaceSettings-preset {
  height: 26px; padding: 0 10px; font-size: 12px; cursor: pointer;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  color: var(--interactive-normal, rgba(255,255,255,0.72));
  transition: background-color 120ms ease, color 120ms ease;
}
.LovelaceSettings-preset:hover { background: rgba(255,255,255,0.09); color: #fff; }

.LovelaceSettings-color { margin-bottom: 14px; }
.LovelaceSettings-swatches { display: flex; gap: 6px; margin: 8px 0 6px; }
.LovelaceSettings-swatch {
  width: 22px; height: 22px; padding: 0; cursor: pointer;
  border-radius: 6px; border: 1px solid rgba(255,255,255,0.16);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.LovelaceSettings-swatch:hover { transform: scale(1.12); }
.LovelaceSettings-swatch.active {
  box-shadow: 0 0 0 2px rgba(255,255,255,0.75);
}
.LovelaceSettings-preview {
  width: 14px; height: 14px; margin-left: auto; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.2);
}

.LovelaceSettings-hex, .LovelaceSettings-text {
  width: 100%; height: 30px; padding: 0 9px; box-sizing: border-box;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.28); color: #fff;
  font-size: 12px; font-family: var(--font-code, monospace);
  outline: none;
}
.LovelaceSettings-hex:focus, .LovelaceSettings-text:focus {
  border-color: rgba(255,255,255,0.30);
}
.LovelaceSettings-hex.invalid { border-color: rgba(240,71,71,0.6); }

.LovelaceSettings-slider { margin-bottom: 12px; }
.LovelaceSettings-sliderHead {
  display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
}
.LovelaceSettings-value {
  margin-left: auto; font-variant-numeric: tabular-nums;
  color: var(--text-muted, rgba(255,255,255,0.45)); font-size: 12px;
}
.LovelaceSettings-reset {
  width: 20px; height: 20px; padding: 0; cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 4px; background: transparent;
  color: var(--interactive-normal, rgba(255,255,255,0.55));
  transition: color 120ms ease, background-color 120ms ease;
}
.LovelaceSettings-reset:hover {
  color: #fff; background: rgba(255,255,255,0.08);
}
.LovelaceSettings-range {
  width: 100%; height: 4px; margin: 0; cursor: pointer;
  -webkit-appearance: none; appearance: none;
  border-radius: 2px; background: rgba(255,255,255,0.14);
}
.LovelaceSettings-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; cursor: pointer;
  box-shadow: 0 0 6px 1px rgba(255,90,190,0.45);
}
`;
  }

  /* ------------------------------------------------------------------------
     UPDATE-PRUEFUNG

     BetterDiscord wertet @updateUrl im Kopf dieser Datei NICHT aus - ohne
     Code hier ist der Eintrag reine Deko. Also machen wir es selbst: beim
     Start die Fassung auf GitHub holen, @version vergleichen, und bei einer
     neueren Fassung anbieten, die Datei zu ersetzen. BetterDiscord bemerkt
     die geaenderte Datei von allein und laedt neu.

     Das Theme haengt mit drin. Lovelace.theme.css ist reines CSS und kann
     sich unmoeglich selbst aktualisieren - CSS fuehrt keinen Code aus. Da
     dieses Plugin ohnehin das Gegenstueck zum Theme ist, uebernimmt es die
     Pruefung fuer beide.

     Ueber normales fetch() laeuft das nicht: Discords CSP blockt fremde
     Hosts. BdApi.Net.fetch geht ueber den Hauptprozess daran vorbei.
     --------------------------------------------------------------------- */

  const THEME_UPDATE_URL = 'https://raw.githubusercontent.com/Enjuchan/Lovelace/main/Lovelace.theme.css';
  const UPDATE_VERZOEGERUNG = 8000;   /* Discord erst in Ruhe starten lassen */

  let updateTimer = null;

  /* Nur den Kopf durchsuchen - im Rumpf koennte '@version' als Text stehen. */
  function versionAus(text) {
    return /@version\s+([0-9][0-9A-Za-z.\-+]*)/.exec(String(text).slice(0, 2000))?.[1] ?? null;
  }

  /* Stellenweiser Zahlenvergleich: '1.10.0' ist neuer als '1.9.0'. Ein reiner
     Textvergleich wuerde hier das Gegenteil behaupten. */
  function istNeuer(fern, lokal) {
    const teile = v => String(v ?? '').split('.').map(n => parseInt(n, 10) || 0);
    const a = teile(fern);
    const b = teile(lokal);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  async function ladeDatei(url) {
    /* Cache-Buster: raw.githubusercontent liefert sonst minutenlang die
       alte Fassung aus, und der Update-Check meldet nichts. */
    const trenner = url.includes('?') ? '&' : '?';
    const antwort = await BdApi.Net.fetch(url + trenner + 't=' + Date.now(),
      { headers: { 'Cache-Control': 'no-cache' } });
    if (!antwort.ok) throw new Error('HTTP ' + antwort.status);

    const text = await antwort.text();

    /* Wichtig: Eine falsche URL liefert eine HTML-Fehlerseite mit Status 200
       statt einer Addon-Datei. Ohne diese Pruefung wuerde die einfach ueber
       das laufende Addon geschrieben und es waere kaputt. */
    if (text.length < 200 || !versionAus(text)) {
      throw new Error('Antwort sieht nicht nach einer Addon-Datei aus');
    }
    return text;
  }

  /* Bewusst die Callback-Fassung von writeFile und nicht fs.promises: das
     fs-Modul, das Discords Renderer ueber require herausgibt, hat keine
     promises-Eigenschaft. fs.promises.writeFile scheitert dort mit
     "Cannot read properties of undefined". */
  function schreibeAddon(ordner, dateiname, inhalt) {
    const fs = require('fs');
    const path = require('path');
    const ziel = path.join(ordner, dateiname);
    return new Promise((erfuellen, ablehnen) => {
      fs.writeFile(ziel, inhalt, 'utf8', fehler => fehler ? ablehnen(fehler) : erfuellen());
    });
  }

  /* Liefert das beschreibende Objekt fuer beide Ziele - oder null, wenn das
     Ziel gar nicht installiert ist (Theme kann fehlen). */
  function updateZiele() {
    const ziele = [{
      bezeichnung: meta.name,
      url: meta.updateUrl,
      version: meta.version,
      ordner: BdApi.Plugins.folder,
      datei: meta.filename
    }];

    const theme = BdApi.Themes.getAll?.().find(t => t.name === THEME_NAME);
    if (theme) {
      ziele.push({
        bezeichnung: THEME_NAME + ' (Theme)',
        url: THEME_UPDATE_URL,
        version: theme.version,
        ordner: BdApi.Themes.folder,
        datei: theme.filename
      });
    }
    return ziele;
  }

  async function pruefeAufUpdates({ leise = true } = {}) {
    let gefunden = 0;

    for (const ziel of updateZiele()) {
      if (!ziel.url || !ziel.datei) continue;

      let inhalt;
      try {
        inhalt = await ladeDatei(ziel.url);
      } catch (e) {
        /* Kein Netz, GitHub gerade weg, Tippfehler in der URL - alles kein
           Grund, den Nutzer zu behelligen. Nur ins Log. */
        console.warn('[LovelaceSettings] Update check for ' + ziel.bezeichnung + ' failed:', e.message);
        continue;
      }

      const fern = versionAus(inhalt);
      if (!istNeuer(fern, ziel.version)) continue;

      gefunden++;
      UI.showNotice(ziel.bezeichnung + ' ' + fern + ' is available (installed: ' + ziel.version + ').', {
        type: 'info',
        buttons: [{
          label: 'Update',
          /* BetterDiscord reicht dem Knopf die Funktion zum Schliessen der
             Meldung als erstes Argument herein. Zuerst schliessen, dann
             melden: das Schreiben stoesst BetterDiscords Neuladen an, und
             danach muss hier nichts mehr passieren. Schlaegt es fehl, bleibt
             die Meldung absichtlich stehen - sonst waere der zweite Versuch
             weg. */
          onClick: async (schliessen) => {
            try {
              await schreibeAddon(ziel.ordner, ziel.datei, inhalt);
              schliessen?.();
              UI.showToast(ziel.bezeichnung + ' updated to ' + fern + '.', { type: 'success' });
            } catch (e) {
              console.error('[LovelaceSettings] Update failed:', e);
              UI.showToast('Update failed - see console.', { type: 'error' });
            }
          }
        }]
      });
    }

    if (!gefunden && !leise) UI.showToast('Everything is up to date.', { type: 'success' });
    return gefunden;
  }

  /* ------------------------------------------------------------------------
     LEBENSZYKLUS
     --------------------------------------------------------------------- */

  function forceRerenderToolbar() {
    const selector = constants.toolbarClasses?.toolbar;
    if (!selector) return;
    const el = document.querySelector('.' + selector);
    if (!el) return;
    const instance = BdApi.ReactUtils.getOwnerInstance(el, { filter: i => i?.forceUpdate });
    instance?.forceUpdate?.();
  }

  function start() {
    /* Bewusst VOR dem try: scheitert der Rest, ist die Update-Pruefung erst
       recht interessant - womoeglich behebt die neue Fassung genau das. */
    updateTimer = setTimeout(() => { pruefeAufUpdates(); }, UPDATE_VERZOEGERUNG);

    try {
      /* Nur noch fuer das Neuzeichnen der Toolbar gebraucht. Faellt der Fund
         aus, erscheint der Knopf beim naechsten Kanalwechsel - kein Grund,
         das ganze Plugin scheitern zu lassen. */
      constants.toolbarClasses = Webpack.getModule(m => m.title && m.toolbar && m.iconWrapper) || {};

      /* Discords eigene Tooltip-Komponente - dieselbe, die DynamicBackgrounds
         fuer seinen Toolbar-Knopf verwendet. Das HTML-Attribut title reicht
         hier nicht: Discord unterdrueckt den nativen Tooltip in der Toolbar,
         deshalb erschien beim Hovern gar nichts. Findet der Griff ins Leere,
         faellt der Knopf unten auf title zurueck. */
      constants.Tooltip = Webpack.getModule(
        Webpack.Filters.byStrings('this.renderTooltip()]'), { searchExports: true }) || null;

      DOM.addStyle(meta.slug + '-ui', panelCSS());
      applySettings(loadSettings());
      startRootObserver();
      startPanelObserver();

      /* Toolbar patchen - exakt dieselbe Stelle wie DynamicBackgrounds, damit
         beide Knoepfe nebeneinander erscheinen. */
      const filter = module => module?.Icon && module.Title && module.toString().includes('section');
      const HeaderBarModule = Webpack.getModule(m => Object.values(m).some(filter));
      if (!HeaderBarModule) throw new Error('Cannot find toolbar module');
      const headerBarKey = Object.keys(HeaderBarModule).find(key => filter(HeaderBarModule[key]));
      if (!headerBarKey) throw new Error('Cannot find toolbar module key');

      Patcher.before(meta.slug, HeaderBarModule, headerBarKey, (_, args) => {
        if (Array.isArray(args[0]?.toolbar?.props?.children) &&
            !args[0].toolbar.props.children.some?.(e => e?.key === meta.slug)) {
          args[0].toolbar.props.children.splice(-2, 0,
            jsx(PopoutComponent, { key: meta.slug }));
        }
      });

      forceRerenderToolbar();
    } catch (e) {
      console.error('%c[LovelaceSettings] %cCould not start.', 'color:#ff5abe;font-weight:bold', '', e);
      UI.showToast('LovelaceSettings could not start - see console.', { type: 'error' });
    }
  }

  function stop() {
    /* Sonst schlaegt die Pruefung noch zu, nachdem das Plugin aus ist. */
    clearTimeout(updateTimer);
    updateTimer = null;

    Patcher.unpatchAll(meta.slug);
    /* Beide Stylesheets entfernen. Ohne das blieben die Variablen gesetzt und
       das Theme haette weiterhin die Plugin-Werte statt seiner eigenen. */
    DOM.removeStyle(STYLE_ID);
    DOM.removeStyle(meta.slug + '-ui');
    /* Ohne das blieben die Klassen am body stehen und das Theme haette
       weiterhin Funktionen abgeschaltet, obwohl das Plugin aus ist. */
    stopRootObserver();
    stopPanelObserver();
    currentSettings = null;
    clearRootClasses();
    forceRerenderToolbar();
  }

  return { start, stop };
};