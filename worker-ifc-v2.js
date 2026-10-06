/* =========================================================
   APavan ATP — Worker de Extração IFC (v4 — completo)
   APAVAN ENGENHARIA E CONSULTORIA

   Extrai o MÁXIMO de informação do IFC:
   - Psets + Qto_ (separados)
   - Perfil geométrico + dimensões dos Psets
   - Material (elemento / type / pset)
   - Fck (busca ampla)
   - Bounding Box
   - Coordenadas globais (recursivas)
   - Storey / Edifício / Projeto
   - Type Object
   - Classification
   - Groups / Layers
   ========================================================= */

self.onmessage = (e) => {
  const { cmd, texto } = e.data;

  if (cmd === 'extract') {
    try {
      const t0 = performance.now();
      const entities = parseIFC(texto);
      const ctx = construirContexto(entities);
      const elementos = extrairElementos(entities, ctx);
      const t1 = performance.now();

      self.postMessage({
        type: 'extracted',
        elementos,
        total: elementos.length,
        tempoMs: Math.round(t1 - t0),
        totalEntidades: entities.size
      });
    } catch (err) {
      self.postMessage({ type: 'erro', mensagem: err.message });
    }
  }
};

/* =========================================================
   1. PARSER STEP / IFC
   ========================================================= */
function parseIFC(text) {
  const entities = new Map();

  const dataStart = text.indexOf('DATA;');
  const dataEnd = text.lastIndexOf('ENDSEC;');
  if (dataStart === -1 || dataEnd === -1) {
    throw new Error('Arquivo IFC inválido: seção DATA não encontrada.');
  }

  const dataSection = text.substring(dataStart + 5, dataEnd);

  const linhas = [];
  let buffer = '';
  for (const linha of dataSection.split('\n')) {
    buffer += linha.trim();
    if (buffer.endsWith(';')) {
      linhas.push(buffer);
      buffer = '';
    }
  }
  if (buffer.trim()) linhas.push(buffer);

  for (const linha of linhas) {
    const m = linha.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)\s*;?$/i);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    entities.set(id, { id, type: m[2].toUpperCase(), args: parseArgs(m[3]) });
  }

  return entities;
}

function parseArgs(str) {
  const args = [];
  let depth = 0;
  let inString = false;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    if (inString) {
      if (c === "'") {
        if (str[i + 1] === "'") { current += "'"; i++; }
        else { inString = false; current += c; }
      } else {
        current += c;
      }
      continue;
    }

    if (c === "'") { inString = true; current += c; }
    else if (c === '(') { depth++; current += c; }
    else if (c === ')') { depth--; current += c; }
    else if (c === ',' && depth === 0) {
      args.push(parseValue(current.trim()));
      current = '';
    } else {
      current += c;
    }
  }

  if (current.trim()) args.push(parseValue(current.trim()));
  return args;
}

function parseValue(v) {
  if (v === '' || v === '$') return null;
  if (v === '*') return undefined;
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('.') && v.endsWith('.')) return v.slice(1, -1);
  if (v.startsWith('#')) return { ref: parseInt(v.slice(1), 10) };
  if (v.startsWith('(') && v.endsWith(')')) return parseArgs(v.slice(1, -1));
  const nested = v.match(/^([A-Z0-9_]+)\s*\(([\s\S]*)\)$/i);
  if (nested) return { type: nested[1].toUpperCase(), args: parseArgs(nested[2]) };
  const n = Number(v);
  if (!isNaN(n) && v !== '') return n;
  return v;
}

/* =========================================================
   2. CONTEXTO GLOBAL (índices + unidades + projeto)
   ========================================================= */
function construirContexto(entities) {
  const ctx = {
    defsByProp: new Map(),
    assocMat: new Map(),
    contInSpatial: new Map(),
    defsByType: new Map(),
    assocClass: new Map(),
    groupsByElement: new Map(),
    project: null,
    unidades: { comprimento: 'm', area: 'm²', volume: 'm³' }
  };

  for (const [, ent] of entities) {
    if (ent.type === 'IFCPROJECT') {
      ctx.project = { nome: valorTexto(ent.args[2]), descricao: valorTexto(ent.args[3]) };
    }
    if (ent.type === 'IFCSIUNIT') {
      const tipo = valorTexto(ent.args[1]);
      const unidade = valorTexto(ent.args[2]);
      const prefixo = ent.args[3];
      if (tipo === 'LENGTHUNIT') {
        if (unidade === 'METRE') {
          if (prefixo === 'MILLI') ctx.unidades.comprimento = 'mm';
          else if (prefixo === 'CENTI') ctx.unidades.comprimento = 'cm';
          else ctx.unidades.comprimento = 'm';
        }
      }
    }
  }

  for (const [, ent] of entities) {
    if (ent.type === 'IFCRELDEFINESBYPROPERTIES') {
      const related = ent.args[4];
      const relDef = ent.args[5];
      if (Array.isArray(related)) {
        for (const r of related) {
          if (!r || !r.ref) continue;
          if (!ctx.defsByProp.has(r.ref)) ctx.defsByProp.set(r.ref, []);
          ctx.defsByProp.get(r.ref).push(relDef);
        }
      }
    }
    if (ent.type === 'IFCRELASSOCIATESMATERIAL') {
      const related = ent.args[4];
      const mat = ent.args[5];
      if (Array.isArray(related)) {
        for (const r of related) if (r && r.ref) ctx.assocMat.set(r.ref, mat);
      }
    }
    if (ent.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const related = ent.args[4];
      const spatial = ent.args[5];
      if (Array.isArray(related)) {
        for (const r of related) if (r && r.ref) ctx.contInSpatial.set(r.ref, spatial);
      }
    }
    if (ent.type === 'IFCRELDEFINESBYTYPE') {
      const related = ent.args[4];
      const type = ent.args[5];
      if (Array.isArray(related)) {
        for (const r of related) if (r && r.ref) ctx.defsByType.set(r.ref, type);
      }
    }
    if (ent.type === 'IFCRELASSOCIATESCLASSIFICATION') {
      const related = ent.args[4];
      const cls = ent.args[5];
      if (Array.isArray(related)) {
        for (const r of related) if (r && r.ref) ctx.assocClass.set(r.ref, cls);
      }
    }
    if (ent.type === 'IFCRELASSIGNSTOGROUP') {
      const related = ent.args[4];
      const grp = ent.args[5];
      if (Array.isArray(related)) {
        for (const r of related) {
          if (!r || !r.ref) continue;
          if (!ctx.groupsByElement.has(r.ref)) ctx.groupsByElement.set(r.ref, []);
          ctx.groupsByElement.get(r.ref).push(grp);
        }
      }
    }
  }

  return ctx;
}

/* =========================================================
   3. EXTRAÇÃO DE ELEMENTOS ESTRUTURAIS
   ========================================================= */
function extrairElementos(entities, ctx) {
  const TIPOS = {
    IFCBEAM: { categoria: 'Viga', sigla: 'V' },
    IFCCOLUMN: { categoria: 'Pilar', sigla: 'P' },
    IFCCOLUMNSTANDARDCASE: { categoria: 'Pilar', sigla: 'P' },
    IFCSLAB: { categoria: 'Laje', sigla: 'L' },
    IFCSLABSTANDARDCASE: { categoria: 'Laje', sigla: 'L' },
    IFCFOOTING: { categoria: 'Sapata', sigla: 'S' },
    IFCPILE: { categoria: 'Estaca', sigla: 'E' },
    IFCWALL: { categoria: 'Parede', sigla: 'W' },
    IFCWALLSTANDARDCASE: { categoria: 'Parede', sigla: 'W' },
    IFCMEMBER: { categoria: 'Elemento', sigla: 'M' },
    IFCPLATE: { categoria: 'Chapa', sigla: 'C' },
    IFCSTAIR: { categoria: 'Escada', sigla: 'ESC' },
    IFCSTAIRFLIGHT: { categoria: 'Escada', sigla: 'ESC' },
    IFCROOF: { categoria: 'Cobertura', sigla: 'Cob' },
    IFCBUILDINGELEMENTPROXY: { categoria: 'Elemento', sigla: 'EP' },
    IFCRAILING: { categoria: 'Guarda-corpo', sigla: 'GC' },
    IFCCURTAINWALL: { categoria: 'Fachada', sigla: 'F' },
    IFCDOOR: { categoria: 'Porta', sigla: 'Po' },
    IFCWINDOW: { categoria: 'Janela', sigla: 'J' },
    IFCCOVERING: { categoria: 'Revestimento', sigla: 'Rev' }
  };

  const elementos = [];

  for (const [id, ent] of entities) {
    if (!TIPOS[ent.type]) continue;
    const meta = TIPOS[ent.type];
    const a = ent.args;

    const propriedades = extrairProps(entities, id, ctx);
    const quantidades = extrairQuantidades(entities, id, ctx);
    const material = extrairMaterial(entities, id, ctx);
    const dimensoes = extrairDimensoes(entities, a[6], id, ctx, propriedades);
    const bbox = extrairBoundingBox(entities, a[6]);
    const posicao = extrairPosicaoGlobal(entities, a[5]);
    const spatial = extrairSpatial(entities, id, ctx);
    const tipoObj = extrairTipo(entities, id, ctx);
    const classificacao = extrairClassificacao(entities, id, ctx);
    const grupos = extrairGrupos(entities, id, ctx);
    const fck = extrairFck(propriedades, material, tipoObj);

    elementos.push({
      expressID: id,
      ifcType: ent.type,
      categoria: meta.categoria,
      sigla: meta.sigla,

      globalId: valorTexto(a[0]),
      nome: valorTexto(a[2]),
      descricao: valorTexto(a[3]),
      objectType: valorTexto(a[4]),
      tag: valorTexto(a[7]),
      predefinedType: valorTexto(a[8]),

      posicao,
      bbox,
      spatial,
      grupos,

      dimensoes,
      material,
      fck,
      tipoObj,
      classificacao,

      propriedades,
      quantidades
    });
  }

  return elementos;
}

/* =========================================================
   4. PROPERTY SETS (Psets reais, sem Qto_)
   ========================================================= */
function extrairProps(entities, elementId, ctx) {
  const props = {};

  const processarPset = (pd) => {
    const nomeSet = valorTexto(pd.args[2]) || 'Pset_SemNome';
    if (/^qto[_\s]/i.test(nomeSet.trim())) return; // Qto_ é tratado em outro lugar

    const hasProps = pd.args[4];
    if (!Array.isArray(hasProps)) return;
    if (!props[nomeSet]) props[nomeSet] = {};

    for (const pRef of hasProps) {
      if (!pRef || !pRef.ref) continue;
      const prop = entities.get(pRef.ref);
      if (!prop) continue;

      if (prop.type === 'IFCPROPERTYSINGLEVALUE') {
        const nome = valorTexto(prop.args[0]);
        const valor = valorSimples(prop.args[2], entities);
        if (nome) props[nomeSet][nome] = valor;
      } else if (prop.type === 'IFCPROPERTYENUMERATEDVALUE') {
        const nome = valorTexto(prop.args[0]);
        const enumVals = prop.args[2];
        if (nome && Array.isArray(enumVals)) {
          props[nomeSet][nome] = enumVals.map(x => valorTexto(x)).join(', ');
        }
      } else if (prop.type === 'IFCPROPERTYLISTVALUE') {
        const nome = valorTexto(prop.args[0]);
        const lista = prop.args[2];
        if (nome && Array.isArray(lista)) {
          props[nomeSet][nome] = lista.map(x => valorSimples(x, entities)).join(', ');
        }
      }
    }
  };

  // 1. Psets do elemento
  const relDefs = ctx.defsByProp.get(elementId) || [];
  for (const pdRef of relDefs) {
    if (!pdRef || !pdRef.ref) continue;
    const pd = entities.get(pdRef.ref);
    if (!pd || pd.type !== 'IFCPROPERTYSET') continue;
    processarPset(pd);
  }

  // 2. Psets herdados do Type Object
  const typeRef = ctx.defsByType.get(elementId);
  if (typeRef && typeRef.ref) {
    const typeRelDefs = ctx.defsByProp.get(typeRef.ref) || [];
    for (const pdRef of typeRelDefs) {
      if (!pdRef || !pdRef.ref) continue;
      const pd = entities.get(pdRef.ref);
      if (!pd || pd.type !== 'IFCPROPERTYSET') continue;
      processarPset(pd);
    }
  }

  return props;
}

/* =========================================================
   5. QUANTITIES (Qto_ — de IfcElementQuantity OU de Pset)
   ========================================================= */
function extrairQuantidades(entities, elementId, ctx) {
  const quantidades = {};

  const processarElementQuantity = (pd) => {
    const nomeSet = valorTexto(pd.args[2]) || 'Qto';
    const quantities = pd.args[5];
    const setQtd = {};
    if (Array.isArray(quantities)) {
      for (const qRef of quantities) {
        if (!qRef || !qRef.ref) continue;
        const q = entities.get(qRef.ref);
        if (!q) continue;
        const qNome = valorTexto(q.args[0]);
        const qValor = q.args[3];
        if (qNome) setQtd[qNome] = qValor;
      }
    }
    quantidades[nomeSet] = setQtd;
  };

  const processarQtoPset = (pd) => {
    const nomeSet = valorTexto(pd.args[2]) || 'Qto';
    const hasProps = pd.args[4];
    const setQtd = {};
    if (Array.isArray(hasProps)) {
      for (const pRef of hasProps) {
        if (!pRef || !pRef.ref) continue;
        const prop = entities.get(pRef.ref);
        if (!prop) continue;
        if (prop.type === 'IFCPROPERTYSINGLEVALUE') {
          const n = valorTexto(prop.args[0]);
          const v = valorSimples(prop.args[2], entities);
          if (n) setQtd[n] = v;
        }
      }
    }
    quantidades[nomeSet] = setQtd;
  };

  const processar = (elementId) => {
    const relDefs = ctx.defsByProp.get(elementId) || [];
    for (const pdRef of relDefs) {
      if (!pdRef || !pdRef.ref) continue;
      const pd = entities.get(pdRef.ref);
      if (!pd) continue;

      if (pd.type === 'IFCELEMENTQUANTITY') {
        processarElementQuantity(pd);
      } else if (pd.type === 'IFCPROPERTYSET') {
        const nome = valorTexto(pd.args[2]) || '';
        if (/^qto[_\s]/i.test(nome.trim())) processarQtoPset(pd);
      }
    }
  };

  processar(elementId);
  const typeRef = ctx.defsByType.get(elementId);
  if (typeRef && typeRef.ref) processar(typeRef.ref);

  return quantidades;
}

/* =========================================================
   6. MATERIAL (elemento → type → pset)
   ========================================================= */
function extrairMaterial(entities, elementId, ctx) {
  // 1. Elemento
  let mat = buscarMaterialDireto(entities, elementId, ctx);
  if (mat) { mat.origem = 'Elemento'; return mat; }

  // 2. Type Object
  const typeRef = ctx.defsByType.get(elementId);
  if (typeRef && typeRef.ref) {
    mat = buscarMaterialDireto(entities, typeRef.ref, ctx);
    if (mat) { mat.origem = 'Type'; return mat; }
  }

  // 3. Relação direta (fallback bruto)
  for (const [, ent] of entities) {
    if (ent.type !== 'IFCRELASSOCIATESMATERIAL') continue;
    const related = ent.args[4];
    if (!Array.isArray(related)) continue;
    const contem = related.some(r => r && r.ref === elementId);
    if (!contem) continue;
    const matRef = ent.args[5];
    if (!matRef || !matRef.ref) continue;
    const matEnt = entities.get(matRef.ref);
    if (!matEnt) continue;
    const m = interpretarMaterial(entities, matEnt);
    if (m) { m.origem = 'Relação'; return m; }
  }

  // 4. Fallback: Psets com nome de material
  const props = extrairProps(entities, elementId, ctx);
  for (const [psetName, campos] of Object.entries(props)) {
    for (const [k, v] of Object.entries(campos)) {
      if (typeof v !== 'string') continue;
      if (/material|concreto|concrete|aço|aco|steel/i.test(k) && v.length > 2 && v.length < 80) {
        return { tipo: 'Pset', nome: v, origem: 'Pset (' + psetName + ')' };
      }
      if (/^C\d{2}(\/\d{2})?$/i.test(v.trim())) {
        return { tipo: 'Classe', nome: 'Concreto ' + v, classe: v, origem: 'Pset (' + psetName + ')' };
      }
    }
  }

  return null;
}

function buscarMaterialDireto(entities, id, ctx) {
  const matRef = ctx.assocMat.get(id);
  if (!matRef || !matRef.ref) return null;
  const mat = entities.get(matRef.ref);
  if (!mat) return null;
  return interpretarMaterial(entities, mat);
}

function interpretarMaterial(entities, mat) {
  if (!mat) return null;

  if (mat.type === 'IFCMATERIAL') {
    return {
      tipo: 'Material',
      nome: valorTexto(mat.args[0]),
      descricao: valorTexto(mat.args[1]),
      categoria: valorTexto(mat.args[2])
    };
  }

  if (mat.type === 'IFCMATERIALLIST') {
    const matsRef = mat.args[0];
    const lista = [];
    if (Array.isArray(matsRef)) for (const mRef of matsRef) {
      if (!mRef || !mRef.ref) continue;
      const m = entities.get(mRef.ref);
      if (m) lista.push(valorTexto(m.args[0]));
    }
    return { tipo: 'Lista', nome: lista.join(', '), materiais: lista };
  }

  if (mat.type === 'IFCMATERIALLAYERSETUSAGE' || mat.type === 'IFCMATERIALLAYERSET') {
    let lset = mat;
    if (mat.type === 'IFCMATERIALLAYERSETUSAGE') {
      const lsetRef = mat.args[0];
      if (!lsetRef || !lsetRef.ref) return { tipo: 'Camadas' };
      lset = entities.get(lsetRef.ref);
      if (!lset) return null;
    }
    const camadasRefs = lset.args[0];
    const camadas = [];
    if (Array.isArray(camadasRefs)) for (const cRef of camadasRefs) {
      if (!cRef || !cRef.ref) continue;
      const c = entities.get(cRef.ref);
      if (!c || c.type !== 'IFCMATERIALLAYER') continue;
      const matRef2 = c.args[0];
      let nomeMat = '';
      if (matRef2 && matRef2.ref) {
        const m2 = entities.get(matRef2.ref);
        if (m2) nomeMat = valorTexto(m2.args[0]);
      }
      camadas.push({ material: nomeMat, espessura: c.args[1] });
    }
    return { tipo: 'Conjunto de camadas', nome: valorTexto(lset.args[1]) || 'Camadas', camadas };
  }

  if (mat.type === 'IFCMATERIALPROFILESETUSAGE' || mat.type === 'IFCMATERIALPROFILESET') {
    let pset = mat;
    if (mat.type === 'IFCMATERIALPROFILESETUSAGE') {
      const psetRef = mat.args[0];
      if (!psetRef || !psetRef.ref) return { tipo: 'Perfis' };
      pset = entities.get(psetRef.ref);
      if (!pset) return null;
    }
    let nome = valorTexto(pset.args[1]) || 'Perfis';
    const profiles = pset.args[2];
    if (Array.isArray(profiles)) {
      for (const pRef of profiles) {
        if (!pRef || !pRef.ref) continue;
        const p = entities.get(pRef.ref);
        if (!p || p.type !== 'IFCMATERIALPROFILE') continue;
        const matRef2 = p.args[0];
        if (matRef2 && matRef2.ref) {
          const m2 = entities.get(matRef2.ref);
          if (m2) { nome = valorTexto(m2.args[0]) || nome; break; }
        }
      }
    }
    return { tipo: 'Conjunto de perfis', nome };
  }

  if (mat.type === 'IFCMATERIALCONSTITUENTSET' || mat.type === 'IFCMATERIALCONSTITUENT') {
    return { tipo: mat.type, nome: '(constituinte)' };
  }

  return { tipo: mat.type, nome: '(desconhecido)' };
}

/* =========================================================
   7. DIMENSÕES (perfil + extrusão + fallback Pset)
   ========================================================= */
function extrairDimensoes(entities, representationRef, elementId, ctx, props) {
  // 1. Perfil geométrico direto
  const items = obterShapeItems(entities, representationRef);
  for (const item of items) {
    const dim = tentarExtrairDeItem(entities, item);
    if (dim && (dim.x != null || dim.y != null || dim.diametro != null)) return dim;
  }

  // 2. MappedItem → geometria do Type
  for (const item of items) {
    if (item.type === 'IFCMAPPEDITEM') {
      const mapped = seguirMappedItem(entities, item);
      if (mapped) return mapped;
    }
  }

  // 3. Type Object (representação própria)
  const typeRef = ctx.defsByType.get(elementId);
  if (typeRef && typeRef.ref) {
    const type = entities.get(typeRef.ref);
    if (type && type.args[6]) {
      const typeItems = obterShapeItems(entities, type.args[6]);
      for (const item of typeItems) {
        const dim = tentarExtrairDeItem(entities, item);
        if (dim && (dim.x != null || dim.y != null)) return dim;
        if (item.type === 'IFCMAPPEDITEM') {
          const mapped = seguirMappedItem(entities, item);
          if (mapped) return mapped;
        }
      }
    }
  }

  // 4. Fallback: extrai dos Psets
  return extrairDimensoesDePsets(props);
}

function tentarExtrairDeItem(entities, item) {
  if (!item) return null;

  if (item.type === 'IFCEXTRUDEDAREASOLID') {
    const perfil = extrairPerfil(entities, item.args[0]);
    return {
      ...perfil,
      tipo: 'Extrudado',
      altura: typeof item.args[3] === 'number' ? item.args[3] : null,
      fonte: 'Geometria'
    };
  }

  if (item.type === 'IFCBOOLEANCLIPPINGRESULT' || item.type === 'IFCBOOLEANRESULT') {
    const firstOp = item.args[0];
    if (firstOp && firstOp.ref) {
      const op = entities.get(firstOp.ref);
      if (op) return tentarExtrairDeItem(entities, op);
    }
  }

  if (item.type === 'IFCSWEPTDISKSOLID') {
    return {
      tipoPerfil: 'Circular (sweep)',
      raio: item.args[0],
      diametro: item.args[0] != null ? item.args[0] * 2 : null,
      tipo: 'SweptDisk',
      fonte: 'Geometria'
    };
  }

  if (item.type === 'IFCFACETEDBREP' || item.type === 'IFCFACETEDBREPWITHVOIDS') {
    return { tipoPerfil: 'BRep', tipo: 'FacetedBRep', fonte: 'Geometria' };
  }

  return null;
}

function seguirMappedItem(entities, mappedItem) {
  const sourceRef = mappedItem.args[0];
  if (!sourceRef || !sourceRef.ref) return null;
  const source = entities.get(sourceRef.ref);
  if (!source || source.type !== 'IFCREPRESENTATIONMAP') return null;

  const repRef = source.args[1];
  if (!repRef || !repRef.ref) return null;
  const rep = entities.get(repRef.ref);
  if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') return null;

  const items = rep.args[3];
  if (!Array.isArray(items)) return null;

  for (const itRef of items) {
    if (!itRef || !itRef.ref) continue;
    const it = entities.get(itRef.ref);
    if (!it) continue;
    const dim = tentarExtrairDeItem(entities, it);
    if (dim && (dim.x != null || dim.y != null || dim.diametro != null)) return dim;
  }
  return null;
}

function extrairDimensoesDePsets(props) {
  if (!props || !Object.keys(props).length) return null;

  const achado = {
    tipoPerfil: null,
    x: null,
    y: null,
    z: null,
    altura: null,
    espessura: null,
    fonte: 'Pset',
    psetOrigem: null
  };
  let algumAchado = false;

  const mapeamento = {
    x: ['xdimension', 'xdim', 'width', 'largura', 'b', 'basedim', 'basedimension', 'diametro', 'diameter'],
    y: ['ydimension', 'ydim', 'depth', 'profundidade', 'd', 'height', 'altura', 'h'],
    z: ['zdimension', 'zdim', 'length', 'comprimento', 'l', 'elevation', 'altura'],
    secao: ['sectiontype', 'section', 'secao', 'profile', 'profilename', 'shape', 'tipo']
  };

  const casar = (kl, lista) => lista.some(c => kl === c.replace(/[_\s-]/g, ''));

  for (const [psetName, campos] of Object.entries(props)) {
    for (const [k, v] of Object.entries(campos)) {
      if (typeof v !== 'number' && typeof v !== 'string') continue;
      const kl = k.toLowerCase().replace(/[_\s-]/g, '');

      const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));

      if (achado.x === null && casar(kl, mapeamento.x) && !isNaN(num)) {
        achado.x = num; achado.psetOrigem = psetName; algumAchado = true;
      }
      else if (achado.y === null && casar(kl, mapeamento.y) && !isNaN(num)) {
        achado.y = num; achado.psetOrigem = psetName; algumAchado = true;
      }
      else if (achado.z === null && casar(kl, mapeamento.z) && !isNaN(num)) {
        achado.z = num; achado.psetOrigem = psetName; algumAchado = true;
      }

      if (casar(kl, mapeamento.secao) && typeof v === 'string' && v.length < 60) {
        achado.tipoPerfil = v;
        algumAchado = true;
      }
    }
  }

  if (!algumAchado) return null;

  if (achado.x != null && achado.y != null) {
    achado.secao = `${achado.x} × ${achado.y} m`;
    if (!achado.tipoPerfil) achado.tipoPerfil = 'Retangular (do Pset)';
  }
  if (achado.z != null) achado.altura = achado.z;

  return achado;
}

function obterShapeItems(entities, representationRef) {
  const items = [];
  if (!representationRef || !representationRef.ref) return items;
  const pds = entities.get(representationRef.ref);
  if (!pds || pds.type !== 'IFCPRODUCTDEFINITIONSHAPE') return items;

  const reps = pds.args[2];
  if (!Array.isArray(reps)) return items;

  for (const repRef of reps) {
    if (!repRef || !repRef.ref) continue;
    const rep = entities.get(repRef.ref);
    if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') continue;
    const its = rep.args[3];
    if (Array.isArray(its)) for (const itRef of its) {
      if (!itRef || !itRef.ref) continue;
      const it = entities.get(itRef.ref);
      if (it) items.push(it);
    }
  }
  return items;
}

function extrairPerfil(entities, profileRef) {
  if (!profileRef || !profileRef.ref) return {};
  const prof = entities.get(profileRef.ref);
  if (!prof) return {};

  if (prof.type === 'IFCRECTANGLEPROFILEDEF')
    return { tipoPerfil: 'Retangular', x: prof.args[3], y: prof.args[4] };
  if (prof.type === 'IFCRECTANGLEHOLLOWPROFILEDEF')
    return { tipoPerfil: 'Retangular vazado', x: prof.args[3], y: prof.args[4], espessura: prof.args[5] };
  if (prof.type === 'IFCCIRCLEPROFILEDEF')
    return { tipoPerfil: 'Circular', raio: prof.args[3], diametro: prof.args[3] != null ? prof.args[3] * 2 : null };
  if (prof.type === 'IFCCIRCLEHOLLOWPROFILEDEF')
    return { tipoPerfil: 'Circular vazado', raio: prof.args[3], espessura: prof.args[4] };
  if (prof.type === 'IFCISHAPEPROFILEDEF')
    return { tipoPerfil: 'I', largura: prof.args[3], altura: prof.args[4], espessuraAlma: prof.args[5], espessuraMesa: prof.args[6] };
  if (prof.type === 'IFCTSHAPEPROFILEDEF')
    return { tipoPerfil: 'T', largura: prof.args[3], altura: prof.args[4], espessuraAlma: prof.args[5], espessuraMesa: prof.args[6] };
  if (prof.type === 'IFCLSHAPEPROFILEDEF')
    return { tipoPerfil: 'L', largura: prof.args[3], altura: prof.args[4], espessura: prof.args[5] };
  if (prof.type === 'IFCARBITRARYCLOSEDPROFILEDEF')
    return { tipoPerfil: 'Arbitrário' };
  if (prof.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS')
    return { tipoPerfil: 'Arbitrário com vazios' };
  if (prof.type === 'IFCCOMPOSITEPROFILEDEF')
    return { tipoPerfil: 'Composto' };

  return { tipoPerfil: prof.type };
}

/* =========================================================
   8. BOUNDING BOX
   ========================================================= */
function extrairBoundingBox(entities, representationRef) {
  const items = obterShapeItems(entities, representationRef);
  for (const it of items) {
    if (it.type === 'IFCBOUNDINGBOX') {
      const corner = obterPonto(entities, it.args[0]);
      return {
        length: it.args[1],
        width: it.args[2],
        height: it.args[3],
        corner
      };
    }
  }
  return null;
}

function obterPonto(entities, pointRef) {
  if (!pointRef || !pointRef.ref) return null;
  const pt = entities.get(pointRef.ref);
  if (!pt || pt.type !== 'IFCCARTESIANPOINT') return null;
  const coords = pt.args[0];
  if (!Array.isArray(coords)) return null;
  return { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0 };
}

/* =========================================================
   9. POSIÇÃO GLOBAL (recursiva)
   ========================================================= */
function extrairPosicaoGlobal(entities, placeRef, visitados = new Set()) {
  if (!placeRef || !placeRef.ref || visitados.has(placeRef.ref)) return null;
  visitados.add(placeRef.ref);

  const place = entities.get(placeRef.ref);
  if (!place || place.type !== 'IFCLOCALPLACEMENT') return null;

  const relRef = place.args[0];
  let propria = { x: 0, y: 0, z: 0 };
  if (relRef && relRef.ref) {
    const rel = entities.get(relRef.ref);
    if (rel && (rel.type === 'IFCAXIS2PLACEMENT3D' || rel.type === 'IFCAXIS2PLACEMENT2D')) {
      const pt = obterPonto(entities, rel.args[0]);
      if (pt) propria = pt;
    }
  }

  const paiRef = place.args[1];
  let pai = { x: 0, y: 0, z: 0 };
  if (paiRef && paiRef.ref) {
    const p = extrairPosicaoGlobal(entities, paiRef, visitados);
    if (p) pai = p;
  }

  return {
    x: (pai.x || 0) + (propria.x || 0),
    y: (pai.y || 0) + (propria.y || 0),
    z: (pai.z || 0) + (propria.z || 0)
  };
}

/* =========================================================
   10. SPATIAL STRUCTURE
   ========================================================= */
function extrairSpatial(entities, elementId, ctx) {
  const spatialRef = ctx.contInSpatial.get(elementId);
  if (!spatialRef || !spatialRef.ref) return null;

  const struct = entities.get(spatialRef.ref);
  if (!struct) return null;

  const resultado = {
    tipo: struct.type,
    nome: valorTexto(struct.args[2]),
    descricao: valorTexto(struct.args[3]),
    elevacao: null,
    projeto: ctx.project?.nome || null,
    edificio: null,
    pavimento: null
  };

  if (struct.type === 'IFCBUILDINGSTOREY') {
    resultado.elevacao = struct.args[9];
    resultado.pavimento = valorTexto(struct.args[2]);
    resultado.longName = valorTexto(struct.args[7]);
  }

  for (const [, rel] of entities) {
    if (rel.type !== 'IFCRELAGGREGATES') continue;
    const related = rel.args[5];
    if (!Array.isArray(related)) continue;
    const contem = related.some(r => r && r.ref === spatialRef.ref);
    if (!contem) continue;
    const paiRef = rel.args[4];
    if (paiRef && paiRef.ref) {
      const pai = entities.get(paiRef.ref);
      if (pai) {
        if (pai.type === 'IFCBUILDING') resultado.edificio = valorTexto(pai.args[2]);
        if (pai.type === 'IFCSITE') resultado.site = valorTexto(pai.args[2]);
        if (pai.type === 'IFCPROJECT') resultado.projeto = valorTexto(pai.args[2]);
      }
    }
  }

  return resultado;
}

/* =========================================================
   11. TIPO (Type Object)
   ========================================================= */
function extrairTipo(entities, elementId, ctx) {
  const typeRef = ctx.defsByType.get(elementId);
  if (!typeRef || !typeRef.ref) return null;

  const type = entities.get(typeRef.ref);
  if (!type) return null;

  const a = type.args;
  return {
    tipo: type.type,
    globalId: valorTexto(a[0]),
    nome: valorTexto(a[2]),
    descricao: valorTexto(a[3]),
    applicableOccurrence: valorTexto(a[4]),
    predefinedType: valorTexto(a[8]) || valorTexto(a[9]),
    tag: valorTexto(a[7])
  };
}

/* =========================================================
   12. CLASSIFICAÇÃO
   ========================================================= */
function extrairClassificacao(entities, elementId, ctx) {
  const clsRef = ctx.assocClass.get(elementId);
  if (!clsRef || !clsRef.ref) return null;

  const cls = entities.get(clsRef.ref);
  if (!cls) return null;

  if (cls.type === 'IFCCLASSIFICATIONREFERENCE') {
    const a = cls.args;
    const fonteRef = a[3];
    let fonteNome = '';
    if (fonteRef && fonteRef.ref) {
      const fonte = entities.get(fonteRef.ref);
      if (fonte) {
        if (fonte.type === 'IFCCLASSIFICATION') fonteNome = valorTexto(fonte.args[0]);
        else if (fonte.type === 'IFCCLASSIFICATIONREFERENCE') fonteNome = valorTexto(fonte.args[2]);
      }
    }
    return {
      tipo: 'Referência',
      identificacao: valorTexto(a[1]),
      nome: valorTexto(a[2]),
      fonte: fonteNome
    };
  }

  if (cls.type === 'IFCCLASSIFICATION') {
    return {
      tipo: 'Sistema',
      fonte: valorTexto(cls.args[0]),
      edicao: valorTexto(cls.args[1]),
      nome: valorTexto(cls.args[3])
    };
  }

  return { tipo: cls.type };
}

/* =========================================================
   13. GRUPOS / LAYERS
   ========================================================= */
function extrairGrupos(entities, elementId, ctx) {
  const grupos = [];
  const grpRefs = ctx.groupsByElement.get(elementId) || [];

  for (const grpRef of grpRefs) {
    if (!grpRef || !grpRef.ref) continue;
    const grp = entities.get(grpRef.ref);
    if (!grp) continue;
    grupos.push({
      tipo: grp.type,
      nome: valorTexto(grp.args[2]),
      descricao: valorTexto(grp.args[3]),
      objectType: valorTexto(grp.args[4])
    });
  }

  return grupos;
}

/* =========================================================
   14. Fck / Classe do concreto (busca ampla)
   ========================================================= */
function extrairFck(propriedades, material, tipoObj) {
  const chaves = [
    'StrengthClass', 'ConcreteGrade', 'Fck', 'ResistenciaCaracteristica',
    'ConcreteStrength', 'ConcreteClass', 'Grade', 'Resistência', 'Resistencia',
    'ResistenciaCaracteristica', 'classe'
  ];

  for (const [psetName, pset] of Object.entries(propriedades || {})) {
    for (const [k, v] of Object.entries(pset)) {
      const kl = k.toLowerCase();
      if (chaves.some(c => kl.includes(c.toLowerCase()))) {
        return { valor: v, fonte: psetName + '.' + k };
      }
      if (typeof v === 'string' && /^C\d{2}(\/\d{2})?$/i.test(v.trim())) {
        return { valor: v, fonte: psetName + '.' + k };
      }
      if (typeof v === 'string') {
        const m = v.match(/\bC\d{2}(\/\d{2})?\b/i);
        if (m) return { valor: m[0], fonte: psetName + '.' + k };
      }
    }
  }

  const fontes = [material?.nome, material?.descricao, tipoObj?.nome, tipoObj?.descricao];
  for (const f of fontes) {
    if (typeof f === 'string') {
      const m = f.match(/\bC\d{2}(\/\d{2})?\b/i);
      if (m) return { valor: m[0], fonte: 'nome' };
    }
  }
  return null;
}

/* =========================================================
   15. HELPERS
   ========================================================= */
function valorTexto(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v && v.type && Array.isArray(v.args)) return valorTexto(v.args[0]);
  return '';
}

function valorSimples(v, entities) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;

  if (v.type && Array.isArray(v.args)) {
    if (v.type === 'IFCBOOLEAN') return v.args[0] === 'T';
    if (v.type === 'IFCLOGICAL') return v.args[0] === 'T' ? true : (v.args[0] === 'F' ? false : null);
    const inner = v.args[0];
    if (inner !== undefined) return valorSimples(inner, entities);
    return v.type;
  }

  if (v.ref) {
    const e = entities.get(v.ref);
    return e ? e.type : null;
  }

  if (Array.isArray(v)) return v.map(x => valorSimples(x, entities));

  return v;
}