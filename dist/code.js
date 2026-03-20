"use strict";
(() => {
  // src/constants.ts
  var LIBRARY_FILE_KEY = "COLE_AQUI_O_ID_DA_BIBLIOTECA";
  var STORAGE_KEY = "styleKeyMap";
  var PAGE_SECTION_NAMES = ["1 - Login", "2 - Home"];
  var PAGE_STYLE_NAME = "P\xE1gina Inicial";
  var FOLDER_BASE = "Cores Base";
  var FOLDER_IMMUTABLE = "Cores de Identifica\xE7\xE3o";
  var FOLDER_STATE = "Cores de Estado";

  // src/setup.ts
  function sendSetupDone(success, text, detail) {
    figma.ui.postMessage({ type: "setup-done", success, text, detail });
  }
  function sendProgress(context, pct, label) {
    figma.ui.postMessage({ type: "progress", context, pct: Math.round(pct), label });
  }
  function extractLayerDepth(styleName) {
    const match = styleName.match(/camada\s*(\d+)/i);
    if (!match) return null;
    const depth = parseInt(match[1], 10);
    return isNaN(depth) ? null : depth;
  }
  function parseFolderAndName(fullName) {
    const parts = fullName.split("/");
    const styleName = parts[parts.length - 1].trim();
    const folder = parts.length >= 2 ? parts[parts.length - 2].trim() : "";
    return { folder, styleName };
  }
  async function saveStyleKeys() {
    const styles = await figma.getLocalPaintStylesAsync();
    if (styles.length === 0) {
      sendSetupDone(false, "Nenhum style local encontrado.", "Abra o arquivo da biblioteca e rode o setup novamente.");
      return;
    }
    const keyMap = { page: "", layers: {}, states: {}, immutable: {} };
    const total = styles.length;
    for (let i = 0; i < total; i++) {
      const style = styles[i];
      const { folder, styleName } = parseFolderAndName(style.name);
      const pct = Math.round((i + 1) / total * 100);
      sendProgress("setup", pct, `Lendo "${styleName}"...`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (folder === FOLDER_IMMUTABLE) {
        keyMap.immutable[styleName] = style.key;
        console.log(`\u{1F512} Imut\xE1vel: "${styleName}"`);
        continue;
      }
      if (folder === FOLDER_STATE) {
        keyMap.states[styleName] = style.key;
        console.log(`\u{1F3A8} Estado: "${styleName}"`);
        continue;
      }
      if (folder === FOLDER_BASE) {
        if (styleName.toLowerCase() === PAGE_STYLE_NAME.toLowerCase()) {
          keyMap.page = style.key;
          console.log(`\u{1F3E0} P\xE1gina Inicial \u2192 ${style.key}`);
          continue;
        }
        const depth = extractLayerDepth(styleName);
        if (depth !== null) {
          keyMap.layers[depth] = style.key;
          console.log(`\u{1F4D0} Camada ${depth}: "${styleName}"`);
          continue;
        }
      }
    }
    if (!keyMap.page && Object.keys(keyMap.layers).length === 0) {
      sendSetupDone(false, "Nenhum style mapeado.", "Verifique se os folders e nomes batem com o esperado.");
      return;
    }
    await figma.clientStorage.setAsync(STORAGE_KEY, keyMap);
    const totalLayers = Object.keys(keyMap.layers).length;
    const totalStates = Object.keys(keyMap.states).length;
    const totalImmutable = Object.keys(keyMap.immutable).length;
    sendSetupDone(
      true,
      `${totalLayers} camadas \xB7 ${totalStates} estados \xB7 ${totalImmutable} imut\xE1veis salvos.`
    );
    figma.notify(`\u2705 Setup: ${totalLayers} camadas \xB7 ${totalStates} estados \xB7 ${totalImmutable} imut\xE1veis`);
  }

  // src/styles.ts
  async function loadStylesFromKeys() {
    const keyMap = await figma.clientStorage.getAsync(STORAGE_KEY);
    if (!keyMap) return null;
    const result = { page: null, layers: {}, states: {}, immutable: {} };
    if (keyMap.page) {
      try {
        result.page = await figma.importStyleByKeyAsync(keyMap.page);
      } catch (e) {
        console.warn("\u26A0\uFE0F Falha ao importar P\xE1gina Inicial");
      }
    }
    for (const [depthStr, key] of Object.entries(keyMap.layers)) {
      try {
        const style = await figma.importStyleByKeyAsync(key);
        if (style) result.layers[Number(depthStr)] = style;
      } catch (e) {
        console.warn(`\u26A0\uFE0F Falha ao importar camada ${depthStr}`);
      }
    }
    for (const [name, key] of Object.entries(keyMap.states)) {
      try {
        const style = await figma.importStyleByKeyAsync(key);
        if (style) result.states[name] = style;
      } catch (e) {
        console.warn(`\u26A0\uFE0F Falha ao importar estado "${name}"`);
      }
    }
    for (const [name, key] of Object.entries(keyMap.immutable)) {
      try {
        const style = await figma.importStyleByKeyAsync(key);
        if (style) result.immutable[name] = style;
      } catch (e) {
        console.warn(`\u26A0\uFE0F Falha ao importar imut\xE1vel "${name}"`);
      }
    }
    return result;
  }
  async function discoverStylesFromFile() {
    var _a, _b, _c, _d;
    const result = { page: null, layers: {}, states: {}, immutable: {} };
    const seenIds = /* @__PURE__ */ new Set();
    for (const page of figma.root.children) {
      await page.loadAsync();
      const sections = page.findAll((n) => n.type === "SECTION");
      for (const section of sections) {
        const fillStyleId = section.fillStyleId;
        if (typeof fillStyleId !== "string" || seenIds.has(fillStyleId)) continue;
        seenIds.add(fillStyleId);
        try {
          const style = await figma.getStyleByIdAsync(fillStyleId);
          if (!style) continue;
          const lastName = (_b = (_a = style.name.split("/").pop()) == null ? void 0 : _a.trim()) != null ? _b : "";
          const folder = (_d = (_c = style.name.split("/").slice(-2, -1)[0]) == null ? void 0 : _c.trim()) != null ? _d : "";
          if (lastName.toLowerCase() === PAGE_STYLE_NAME.toLowerCase()) {
            result.page = style;
          } else if (folder === FOLDER_IMMUTABLE) {
            result.immutable[lastName] = style;
          }
        } catch (e) {
        }
      }
    }
    return result;
  }
  async function getStyleMap() {
    const fromKeys = await loadStylesFromKeys();
    if (fromKeys && (fromKeys.page || Object.keys(fromKeys.layers).length > 0)) {
      return fromKeys;
    }
    console.warn("Nenhuma key salva. Tentando auto-descoberta...");
    return await discoverStylesFromFile();
  }

  // src/utils.ts
  function getSections() {
    const selected = figma.currentPage.selection.filter(
      (n) => n.type === "SECTION"
    );
    if (selected.length > 0) return selected;
    return figma.currentPage.findAll((n) => n.type === "SECTION");
  }
  function getSectionDepth(section) {
    let depth = 1;
    let parent = section.parent;
    while (parent) {
      if (parent.type === "SECTION") depth++;
      parent = parent.parent;
    }
    return depth;
  }
  function isPageSection(section) {
    return PAGE_SECTION_NAMES.includes(section.name.trim());
  }
  function isComponentSection(section) {
    return /^componentes?$/i.test(section.name.trim());
  }
  function resolveExpectedStyle(section, styleMap) {
    var _a, _b;
    if (isPageSection(section)) {
      return styleMap.page;
    }
    if (isComponentSection(section)) {
      return (_a = styleMap.immutable["Componentes"]) != null ? _a : null;
    }
    const depth = getSectionDepth(section);
    const availableDepths = Object.keys(styleMap.layers).map(Number).sort((a, b) => a - b);
    if (availableDepths.length === 0) return null;
    const targetDepth = availableDepths.includes(depth) ? depth : availableDepths[availableDepths.length - 1];
    return (_b = styleMap.layers[targetDepth]) != null ? _b : null;
  }
  function isImmutable(section, styleMap) {
    const fillStyleId = section.fillStyleId;
    if (typeof fillStyleId !== "string") return false;
    const baseId = (id) => id.split(",")[0];
    const sectionBaseId = baseId(fillStyleId);
    const immutableBaseIds = Object.values(styleMap.immutable).map((s) => baseId(s.id)).filter(Boolean);
    if (immutableBaseIds.includes(sectionBaseId)) return true;
    if (isComponentSection(section)) {
      const componentStyle = styleMap.immutable["Componentes"];
      if (componentStyle && sectionBaseId === baseId(componentStyle.id)) return true;
    }
    return false;
  }

  // src/reset.ts
  function sendResetDone(success, text, stats, detail) {
    figma.ui.postMessage({ type: "reset-done", success, text, stats, detail });
  }
  function sendProgress2(pct, label) {
    figma.ui.postMessage({ type: "progress", context: "reset", pct: Math.round(pct), label });
  }
  async function resetSectionColors() {
    if (figma.fileKey === LIBRARY_FILE_KEY) {
      sendResetDone(
        false,
        "Reset bloqueado na biblioteca.",
        void 0,
        "O reset n\xE3o pode ser executado no arquivo da biblioteca. Abra um arquivo de projeto."
      );
      figma.notify("\u26D4 Reset bloqueado \u2014 abra um arquivo de projeto.", { error: true });
      return;
    }
    const styleMap = await getStyleMap();
    const totalLayers = Object.keys(styleMap.layers).length;
    if (!styleMap.page && totalLayers === 0) {
      sendResetDone(
        false,
        "Nenhum style encontrado.",
        void 0,
        "Rode o Setup no arquivo da biblioteca primeiro."
      );
      figma.notify("\u274C Rode o Setup na biblioteca primeiro.", { error: true });
      return;
    }
    const sections = getSections();
    const total = sections.length;
    console.log(`Total de sections: ${total} | Camadas dispon\xEDveis: ${Object.keys(styleMap.layers).length}`);
    let updated = 0, ignored = 0, skipped = 0;
    for (let i = 0; i < total; i++) {
      const section = sections[i];
      const pct = Math.round((i + 1) / total * 100);
      sendProgress2(pct, `"${section.name}"`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (isImmutable(section, styleMap)) {
        ignored++;
        continue;
      }
      const expected = resolveExpectedStyle(section, styleMap);
      if (!expected) {
        skipped++;
        continue;
      }
      if (section.fillStyleId !== expected.id) {
        await section.setFillStyleIdAsync(expected.id);
        updated++;
        console.log(`\u2705 "${section.name}" \u2192 "${expected.name}"`);
      }
    }
    const stats = { updated, ignored, skipped };
    sendResetDone(
      true,
      `${updated} atualizadas \xB7 ${ignored} ignoradas \xB7 ${skipped} sem style`,
      stats
    );
    figma.notify(`\u2705 ${updated} atualizadas | \u{1F512} ${ignored} ignoradas`);
  }

  // src/code.ts
  figma.showUI(__html__, {
    width: 280,
    height: 620,
    title: "ColorStack",
    themeColors: true
  });
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "check-setup") {
        const keyMap = await figma.clientStorage.getAsync(STORAGE_KEY);
        const done = keyMap && Object.keys(keyMap).length > 0;
        figma.ui.postMessage({ type: "setup-status", done: !!done });
        return;
      }
      if (msg.type === "resize" && msg.height) {
        figma.ui.resize(280, Math.min(Math.max(msg.height, 300), 900));
        return;
      }
      if (msg.type === "setup") {
        await saveStyleKeys();
        return;
      }
      if (msg.type === "reset") {
        await resetSectionColors();
        return;
      }
    } catch (error) {
      console.error(error);
      figma.ui.postMessage({
        type: msg.type === "setup" ? "setup-done" : "reset-done",
        success: false,
        text: "Erro inesperado. Veja o console para detalhes."
      });
      figma.notify("\u274C Erro ao executar plugin", { error: true });
    }
  };
})();
