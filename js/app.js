/* ===== APAVAN SST — Aplicação Principal ===== */
const App = {
  db: null,
  page: 'dashboard',
  cache: {},           // cache de empresas/setores/trabalhadores
  currentModal: null,

  async init(){
    this.db = new Database();
    await this.db.open();
    await this.db.seedIfEmpty();
    await this.refreshCache();

    document.addEventListener('click', e => this.onClick(e));
    window.addEventListener('hashchange', () => {
      this.page = (location.hash || '#dashboard').slice(1);
      this.render();
    });
    window.addEventListener('online', () => this.updateSync());
    window.addEventListener('offline', () => this.updateSync());
    this.updateSync();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(()=>{});
    }

    this.page = (location.hash || '#dashboard').slice(1);
    this.render();
  },

  async refreshCache(){
    this.cache = {
      empresas: await this.db.getAll('empresas'),
      setores: await this.db.getAll('setores'),
      trabalhadores: await this.db.getAll('trabalhadores')
    };
  },

  updateSync(){
    const bar = document.getElementById('sync-bar');
    if (!bar) return;
    const on = navigator.onLine;
    bar.innerHTML = `<span class="dot ${on?'':'off'}"></span> ${on?'Online — sincronizado':'Offline — dados locais'}`;
  },

  navigate(page){
    location.hash = '#' + page;
    const sb = document.querySelector('.sidebar');
    if (sb) sb.classList.remove('open');
  },

  // =================== RENDER ===================
  async render(){
    const root = document.getElementById('view');
    root.innerHTML = '<div class="empty"><span class="big">⏳</span>Carregando…</div>';
    await this.refreshCache();
    const fn = this.pages[this.page] || this.pages.dashboard;
    try {
      root.innerHTML = await fn.call(this);
      this.afterRender && this.afterRender();
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="card"><h3>Erro</h3><p class="muted small">${err.message}</p></div>`;
    }
    this.updateNav();
  },

  updateNav(){
    document.querySelectorAll('.nav a, .bottom-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === this.page);
    });
  },

  // =================== AÇÕES ===================
  async onClick(e){
    const target = e.target.closest('[data-action]');
    if (!target) {
      // fechar modal clicando no backdrop
      if (e.target.classList.contains('modal-back')) this.closeModal();
      return;
    }
    const a = target.dataset.action;
    const id = target.dataset.id;
    const store = target.dataset.store;
    const page = target.dataset.page;

    if (a === 'toggle-menu') { document.querySelector('.sidebar').classList.toggle('open'); return; }
    if (a === 'nav') { this.navigate(page); return; }
    if (a === 'new') { return this.openForm(store); }
    if (a === 'edit') { return this.openForm(store, id); }
    if (a === 'delete') { return this.confirmDelete(store, id); }
    if (a === 'close-modal') { return this.closeModal(); }
    if (a === 'print') { window.print(); return; }
    if (a === 'export-csv') { return this.exportCSV(store); }
    if (a === 'backup') { return this.backup(); }
    if (a === 'restore') { return this.restore(); }
    if (a === 'seed-reset') { return this.resetSeed(); }
    if (a === 'calc-risk') { return this.calcRisk(); }
    if (a === 'gerar-nc') { return this.gerarNC(); }
  },

  // =================== MODAL / FORM ===================
  openModal(title, bodyHtml, footHtml, onSave){
    this.closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal" role="dialog">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="btn btn-ghost btn-sm" data-action="close-modal">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-foot">${footHtml || ''}
          <button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
          <button class="btn btn-primary" id="modal-save">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    this.currentModal = { back, onSave };
    const saveBtn = back.querySelector('#modal-save');
    saveBtn.addEventListener('click', async () => {
      const data = {};
      back.querySelectorAll('[name]').forEach(inp => {
        data[inp.name] = inp.type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value;
      });
      try {
        await onSave(data);
        this.closeModal();
      } catch (err) { alert('Erro: ' + err.message); }
    });
    back.querySelector('.modal-body').addEventListener('input', () => {
      if (this.page === 'riscos') this.calcRisk();
    });
  },

  closeModal(){
    if (this.currentModal) { this.currentModal.back.remove(); this.currentModal = null; }
  },

  async openForm(store, id){
    const cfg = this.forms[store];
    if (!cfg) return;
    let data = {};
    if (id) data = await this.db.get(store, id) || {};
    const body = cfg.fields.map(f => this.renderField(f, data[f.key])).join('');
    const title = (id ? 'Editar ' : 'Novo ') + cfg.label;
    this.openModal(title, body, '', async (values) => {
      // validação
      for (const f of cfg.fields) {
        if (f.required && (values[f.key] === '' || values[f.key] == null)) {
          throw new Error(`Campo obrigatório: ${f.label}`);
        }
      }
      if (cfg.beforeSave) values = cfg.beforeSave(values, data) || values;
      if (id) await this.db.put(store, { ...data, ...values, id: Number(id) });
      else await this.db.add(store, values);
      await this.log((id?'editou':'criou')+' '+store+' #'+(id||'novo'));
      this.render();
    });
  },

  renderField(f, value){
    const v = value == null ? (f.default ?? '') : value;
    if (f.type === 'select'){
      const opts = (f.options || []).map(o => {
        const val = typeof o === 'object' ? o.value : o;
        const lbl = typeof o === 'object' ? o.label : o;
        return `<option value="${val}" ${String(v)===String(val)?'selected':''}>${lbl}</option>`;
      }).join('');
      return `<div class="field"><label>${f.label}${f.required?' *':''}</label>
        <select name="${f.key}" ${f.required?'required':''}><option value="">— Selecione —</option>${opts}</select></div>`;
    }
    if (f.type === 'textarea'){
      return `<div class="field"><label>${f.label}${f.required?' *':''}</label>
        <textarea name="${f.key}" ${f.required?'required':''}>${this.esc(v)}</textarea></div>`;
    }
    return `<div class="field"><label>${f.label}${f.required?' *':''}</label>
      <input type="${f.type||'text'}" name="${f.key}" value="${this.esc(v)}" ${f.required?'required':''} ${f.readonly?'readonly':''}></div>`;
  },

  async confirmDelete(store, id){
    if (!confirm('Confirmar exclusão deste registro?')) return;
    await this.db.delete(store, id);
    await this.log('excluiu '+store+' #'+id);
    this.render();
  },

  // =================== FÓRMULAS / AUX ===================
  esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  fmtDate(d){ if(!d) return '—'; try{ return new Date(d).toLocaleDateString('pt-BR'); }catch{ return d; } },
  daysUntil(d){ if(!d) return null; return Math.ceil((new Date(d).getTime() - Date.now())/864e5); },
  setorNome(id){ return (this.cache.setores.find(s=>s.id==id)||{}).nome || '—'; },
  trabNome(id){ return (this.cache.trabalhadores.find(t=>t.id==id)||{}).nome || '—'; },
  empresaNome(id){ return (this.cache.empresas.find(e=>e.id==id)||{}).nomeFantasia || (this.cache.empresas[0]||{}).nomeFantasia || '—'; },

  riscoClassif(p, s){
    const r = (Number(p)||0) * (Number(s)||0);
    if (r === 0) return { r:0, cls:'—', badge:'b-cinza' };
    if (r <= 4)  return { r, cls:'Baixo',    badge:'b-verde' };
    if (r <= 9)  return { r, cls:'Moderado', badge:'b-amarelo' };
    if (r <= 14) return { r, cls:'Alto',     badge:'b-laranja', style:'background:#ffe0b2;color:#e65100' };
    return { r, cls:'Crítico', badge:'b-vermelho' };
  },

  calcRisk(){
    const modal = this.currentModal && this.currentModal.back;
    if (!modal) return;
    const p = Number(modal.querySelector('[name="probabilidade"]')?.value || 0);
    const s = Number(modal.querySelector('[name="severidade"]')?.value || 0);
    const info = this.riscoClassif(p, s);
    const el = modal.querySelector('#risk-preview');
    if (el) el.innerHTML = `R = ${p} × ${s} = <strong>${info.r}</strong> — <span class="badge ${info.badge}">${info.cls}</span>`;
  },

  async log(msg){
    await this.db.add('logs', { tipo:'acao', mensagem: msg, data: new Date().toISOString() });
  },

  async exportCSV(store){
    const rows = await this.db.getAll(store);
    if (!rows.length) return alert('Sem dados para exportar.');
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const csv = [keys.join(';'), ...rows.map(r => keys.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(';'))].join('\n');
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `apavan-${store}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  },

  async backup(){
    const data = {};
    for (const s of STORES) data[s] = await this.db.getAll(s);
    const blob = new Blob([JSON.stringify({ versao:'1.0', data, dataBackup:new Date().toISOString() }, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `apavan-sst-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  },

  async restore(){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const txt = await file.text();
      try {
        const obj = JSON.parse(txt);
        if (!obj.data) throw new Error('Arquivo inválido');
        if (!confirm('Substituir todos os dados atuais pelo backup?')) return;
        for (const s of STORES) {
          await this.db.clear(s);
          for (const row of (obj.data[s]||[])) await this.db.put(s, row);
        }
        alert('Backup restaurado.'); this.render();
      } catch(err){ alert('Erro: '+err.message); }
    };
    inp.click();
  },

  async resetSeed(){
    if (!confirm('Apagar TODOS os dados e recriar demonstração?')) return;
    for (const s of STORES) await this.db.clear(s);
    await this.db.seedIfEmpty();
    this.render();
  },

  async gerarNC(){
    // gera NC a partir da última inspeção registrada (exemplo simplificado)
    alert('Não conformidades devem ser registradas na tela de Inspeções (item marcado como "Não conforme").');
  },

  // =================== FORM CONFIG ===================
  get forms(){
    const empOpts = () => this.cache.empresas.map(e => ({ value:e.id, label:e.nomeFantasia||e.razaoSocial }));
    const setOpts = () => this.cache.setores.map(s => ({ value:s.id, label:s.nome }));
    const trabOpts = () => this.cache.trabalhadores.map(t => ({ value:t.id, label:t.nome }));
    return {
      empresas: { label:'Empresa', fields:[
        { key:'razaoSocial', label:'Razão Social', required:true },
        { key:'nomeFantasia', label:'Nome Fantasia' },
        { key:'cnpj', label:'CNPJ' },
        { key:'cnae', label:'CNAE' },
        { key:'grauRisco', label:'Grau de Risco', type:'select', options:['1','2','3','4'] },
        { key:'atividade', label:'Atividade Econômica' },
        { key:'endereco', label:'Endereço' },
        { key:'cidade', label:'Cidade' },
        { key:'estado', label:'UF' },
        { key:'telefone', label:'Telefone' },
        { key:'email', label:'E-mail', type:'email' },
        { key:'responsavel', label:'Responsável SST' },
        { key:'numEmpregados', label:'Nº de Empregados', type:'number' }
      ]},
      setores: { label:'Setor', fields:[
        { key:'empresaId', label:'Empresa', type:'select', options:empOpts(), required:true },
        { key:'nome', label:'Nome do Setor', required:true },
        { key:'descricao', label:'Descrição', type:'textarea' },
        { key:'atividade', label:'Atividade' },
        { key:'numTrabalhadores', label:'Nº Trabalhadores', type:'number' },
        { key:'jornada', label:'Jornada' }
      ]},
      trabalhadores: { label:'Trabalhador', fields:[
        { key:'nome', label:'Nome', required:true },
        { key:'matricula', label:'Matrícula' },
        { key:'cargo', label:'Cargo' },
        { key:'setorId', label:'Setor', type:'select', options:setOpts() },
        { key:'funcao', label:'Função' },
        { key:'admissao', label:'Admissão', type:'date' },
        { key:'situacao', label:'Situação', type:'select', options:['Ativo','Afastado','Desligado'] }
      ]},
      riscos: { label:'Risco', fields:[
        { key:'setorId', label:'Setor', type:'select', options:setOpts(), required:true },
        { key:'atividade', label:'Atividade' },
        { key:'perigo', label:'Perigo', required:true },
        { key:'fonte', label:'Fonte Geradora' },
        { key:'consequencia', label:'Consequência' },
        { key:'categoria', label:'Categoria', type:'select', options:['Físico','Químico','Biológico','Ergonômico','Acidente'], required:true },
        { key:'probabilidade', label:'Probabilidade (1-5)', type:'number', required:true, default:3 },
        { key:'severidade', label:'Severidade (1-5)', type:'number', required:true, default:3 },
        { key:'nr', label:'NR Relacionada' },
        { key:'medidasExistentes', label:'Medidas Existentes', type:'textarea' },
        { key:'medidasPropostas', label:'Medidas Propostas (Hierarquia)', type:'textarea' },
        { key:'responsavel', label:'Responsável' },
        { key:'status', label:'Status', type:'select', options:['Aberto','Em análise','Em execução','Concluído'] }
      ]},
      ncs: { label:'Não Conformidade', fields:[
        { key:'codigo', label:'Código', required:true, default:'NC-' },
        { key:'data', label:'Data', type:'date', default: new Date().toISOString().slice(0,10) },
        { key:'local', label:'Local' },
        { key:'setorId', label:'Setor', type:'select', options:setOpts() },
        { key:'descricao', label:'Descrição', type:'textarea', required:true },
        { key:'nr', label:'NR' },
        { key:'requisito', label:'Requisito/Item' },
        { key:'gravidade', label:'Gravidade', type:'select', options:['Baixa','Média','Alta','Crítica'], required:true },
        { key:'responsavel', label:'Responsável' },
        { key:'prazo', label:'Prazo', type:'date' },
        { key:'acaoCorretiva', label:'Ação Corretiva', type:'textarea' },
        { key:'status', label:'Status', type:'select', options:['Aberta','Em análise','Em execução','Aguardando evidência','Concluída','Cancelada'] }
      ]},
      planoAcao: { label:'Ação 5W2H', fields:[
        { key:'what', label:'O que será feito (What)', required:true, type:'textarea' },
        { key:'why', label:'Por que (Why)', type:'textarea' },
        { key:'where', label:'Onde (Where)' },
        { key:'when', label:'Quando (When)', type:'date', required:true },
        { key:'who', label:'Quem (Who)', required:true },
        { key:'how', label:'Como (How)', type:'textarea' },
        { key:'howMuch', label:'Quanto (How Much)' },
        { key:'prioridade', label:'Prioridade', type:'select', options:['Baixa','Média','Alta','Crítica'] },
        { key:'percentual', label:'% Conclusão', type:'number', default:0 },
        { key:'status', label:'Status', type:'select', options:['Planejada','Em execução','Concluída','Cancelada'] }
      ]},
      epis: { label:'EPI', fields:[
        { key:'trabalhadorId', label:'Trabalhador', type:'select', options:trabOpts(), required:true },
        { key:'epi', label:'EPI', required:true },
        { key:'ca', label:'CA' },
        { key:'fabricante', label:'Fabricante' },
        { key:'dataEntrega', label:'Data de Entrega', type:'date' },
        { key:'quantidade', label:'Quantidade', type:'number', default:1 },
        { key:'validade', label:'Validade / Troca', type:'date' },
        { key:'treinamento', label:'Treinamento', type:'select', options:['OK','Pendente'] }
      ]},
      treinamentos: { label:'Treinamento', fields:[
        { key:'trabalhadorId', label:'Trabalhador', type:'select', options:trabOpts(), required:true },
        { key:'treinamento', label:'Treinamento', required:true },
        { key:'nr', label:'NR' },
        { key:'cargaHoraria', label:'Carga Horária (h)', type:'number' },
        { key:'instrutor', label:'Instrutor' },
        { key:'data', label:'Data', type:'date' },
        { key:'validade', label:'Validade', type:'date' },
        { key:'certificado', label:'Certificado nº' }
      ]},
      documentos: { label:'Documento', fields:[
        { key:'tipo', label:'Tipo', type:'select', options:['PGR','PCMSO','LTCAT','PPP','ASO','Laudo','Certificado','ART','PT','APR','PET','Procedimento','Ordem de Serviço','Outro'], required:true },
        { key:'titulo', label:'Título', required:true },
        { key:'versao', label:'Versão' },
        { key:'data', label:'Data', type:'date' },
        { key:'responsavel', label:'Responsável' },
        { key:'validade', label:'Validade', type:'date' }
      ]},
      inspecoes: { label:'Inspeção', fields:[
        { key:'empresaId', label:'Empresa', type:'select', options:empOpts(), required:true },
        { key:'setorId', label:'Setor', type:'select', options:setOpts() },
        { key:'data', label:'Data', type:'date', default: new Date().toISOString().slice(0,10) },
        { key:'hora', label:'Hora', type:'time' },
        { key:'inspetor', label:'Inspetor', required:true },
        { key:'tipo', label:'Tipo de Inspeção', type:'select', options:['Rotina','Programada','Extraordinária','Auditoria'] },
        { key:'observacoes', label:'Observações', type:'textarea' },
        { key:'itensConformes', label:'Itens Conformes', type:'number', default:0 },
        { key:'itensNaoConformes', label:'Itens Não Conformes', type:'number', default:0 },
        { key:'itensNA', label:'Itens Não Aplicáveis', type:'number', default:0 }
      ]}
    };
  },

  // =================== PÁGINAS ===================
  get pages(){ return {
    dashboard: this.pageDashboard,
    empresas: this.pageEmpresas,
    setores: this.pageSetores,
    trabalhadores: this.pageTrabalhadores,
    riscos: this.pageRiscos,
    inspecoes: this.pageInspecoes,
    ncs: this.pageNCs,
    planoAcao: this.pagePlanoAcao,
    epis: this.pageEpis,
    treinamentos: this.pageTreinamentos,
    documentos: this.pageDocumentos,
    nrs: this.pageNRs,
    relatorios: this.pageRelatorios,
    config: this.pageConfig
  };},

  // ---- Dashboard ----
  async pageDashboard(){
    const [emp, set, trab, riscos, ncs, plano, epis, trein, docs, insp] = await Promise.all([
      this.db.getAll('empresas'), this.db.getAll('setores'), this.db.getAll('trabalhadores'),
      this.db.getAll('riscos'), this.db.getAll('ncs'), this.db.getAll('planoAcao'),
      this.db.getAll('epis'), this.db.getAll('treinamentos'), this.db.getAll('documentos'),
      this.db.getAll('inspecoes')
    ]);

    const riscoCrit = riscos.filter(r => this.riscoClassif(r.probabilidade, r.severidade).r >= 15).length;
    const ncAbertas = ncs.filter(n => !['Concluída','Cancelada'].includes(n.status)).length;
    const ncVencidas = ncs.filter(n => n.prazo && this.daysUntil(n.prazo) < 0 && n.status !== 'Concluída').length;
    const acoesAnd = plano.filter(p => p.status === 'Em execução').length;
    const acoesConc = plano.filter(p => p.status === 'Concluída').length;

    const venc30 = (arr, field='validade') => arr.filter(x => {
      if (!x[field]) return false;
      const d = this.daysUntil(x[field]);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const vencidos = (arr, field='validade') => arr.filter(x => {
      if (!x[field]) return false;
      const d = this.daysUntil(x[field]);
      return d !== null && d < 0;
    }).length;

    // contagem de risco por categoria
    const porCat = {};
    riscos.forEach(r => { porCat[r.categoria || '—'] = (porCat[r.categoria||'—']||0)+1; });
    const catMax = Math.max(1, ...Object.values(porCat));

    // NC por gravidade
    const porGrav = {};
    ncs.forEach(n => { porGrav[n.gravidade||'—'] = (porGrav[n.gravidade||'—']||0)+1; });
    const gravMax = Math.max(1, ...Object.values(porGrav));

    // Conformidade (a partir de inspeções)
    const totalConf = insp.reduce((a,i)=>a+(Number(i.itensConformes)||0),0);
    const totalNC   = insp.reduce((a,i)=>a+(Number(i.itensNaoConformes)||0),0);
    const confPct = (totalConf+totalNC) ? Math.round(totalConf/(totalConf+totalNC)*100) : 0;

    return `
      <div class="page-head">
        <div>
          <h2>Dashboard Gerencial</h2>
          <div class="sub">Visão consolidada de SST — atualizado ${new Date().toLocaleString('pt-BR')}</div>
        </div>
        <button class="btn btn-ghost" data-action="print">🖨 Imprimir</button>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="v">${emp.length}</div><div class="l">Empresas</div></div>
        <div class="kpi"><div class="v">${set.length}</div><div class="l">Setores</div></div>
        <div class="kpi"><div class="v">${trab.length}</div><div class="l">Trabalhadores</div></div>
        <div class="kpi"><div class="v">${riscos.length}</div><div class="l">Riscos Identificados</div></div>
        <div class="kpi danger"><div class="v">${riscoCrit}</div><div class="l">Riscos Críticos</div></div>
        <div class="kpi"><div class="v">${insp.length}</div><div class="l">Inspeções</div></div>
        <div class="kpi warn"><div class="v">${ncAbertas}</div><div class="l">NCs Abertas</div></div>
        <div class="kpi danger"><div class="v">${ncVencidas}</div><div class="l">NCs Vencidas</div></div>
        <div class="kpi warn"><div class="v">${acoesAnd}</div><div class="l">Ações em Andamento</div></div>
        <div class="kpi ok"><div class="v">${acoesConc}</div><div class="l">Ações Concluídas</div></div>
        <div class="kpi warn"><div class="v">${venc30(trein)}</div><div class="l">Treinamentos a vencer (30d)</div></div>
        <div class="kpi danger"><div class="v">${vencidos(trein)}</div><div class="l">Treinamentos Vencidos</div></div>
        <div class="kpi warn"><div class="v">${venc30(docs)}</div><div class="l">Documentos a vencer (30d)</div></div>
        <div class="kpi danger"><div class="v">${vencidos(docs)}</div><div class="l">Documentos Vencidos</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Riscos por Categoria</h3>
          ${Object.keys(porCat).length ? Object.entries(porCat).map(([k,v]) => `
            <div class="bar-row">
              <div class="lbl">${k}</div>
              <div class="bar"><span style="width:${v/catMax*100}%;background:var(--azul)"></span></div>
              <div class="val">${v}</div>
            </div>`).join('') : '<div class="muted small">Nenhum risco cadastrado.</div>'}
        </div>

        <div class="card">
          <h3>Não Conformidades por Gravidade</h3>
          ${Object.keys(porGrav).length ? Object.entries(porGrav).map(([k,v]) => {
            const cor = k==='Crítica'||k==='Alta' ? 'var(--vermelho)' : k==='Média' ? 'var(--amarelo)' : 'var(--verde)';
            return `<div class="bar-row">
              <div class="lbl">${k}</div>
              <div class="bar"><span style="width:${v/gravMax*100}%;background:${cor}"></span></div>
              <div class="val">${v}</div>
            </div>`;
          }).join('') : '<div class="muted small">Nenhuma NC cadastrada.</div>'}
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Indicador de Conformidade</h3>
          <div class="conformidade">
            <div class="num">${confPct}%</div>
            <div class="lbl">Conformidade do Estabelecimento</div>
            <div class="disc">Indicador gerencial baseado nos registros realizados no sistema.</div>
          </div>
          <div class="mt-2 small muted">
            Requisitos avaliados: ${totalConf+totalNC} · Conformes: ${totalConf} · Não conformes: ${totalNC}
          </div>
        </div>

        <div class="card">
          <h3>Não Conformidades e Ações</h3>
          <div class="bar-row"><div class="lbl">NCs abertas</div><div class="bar"><span style="width:${Math.min(100,ncAbertas*10)}%;background:var(--amarelo)"></span></div><div class="val">${ncAbertas}</div></div>
          <div class="bar-row"><div class="lbl">NCs vencidas</div><div class="bar"><span style="width:${Math.min(100,ncVencidas*10)}%;background:var(--vermelho)"></span></div><div class="val">${ncVencidas}</div></div>
          <div class="bar-row"><div class="lbl">Ações abertas</div><div class="bar"><span style="width:${Math.min(100,acoesAnd*10)}%;background:var(--azul)"></span></div><div class="val">${acoesAnd}</div></div>
          <div class="bar-row"><div class="lbl">Ações concluídas</div><div class="bar"><span style="width:${Math.min(100,acoesConc*10)}%;background:var(--verde)"></span></div><div class="val">${acoesConc}</div></div>
        </div>
      </div>

      <div class="card">
        <h3>Alertas — Central de Vencimentos</h3>
        ${this.renderVencimentos(trein, docs, ncs)}
      </div>
    `;
  },

  renderVencimentos(trein, docs, ncs){
    const itens = [];
    trein.forEach(t => t.validade && itens.push({ nome:`Treinamento: ${t.treinamento} — ${this.trabNome(t.trabalhadorId)}`, validade:t.validade }));
    docs.forEach(d => d.validade && itens.push({ nome:`Doc: ${d.titulo}`, validade:d.validade }));
    ncs.forEach(n => n.prazo && n.status !== 'Concluída' && itens.push({ nome:`NC ${n.codigo||''}: ${n.descricao?.slice(0,60)||''}`, validade:n.prazo }));

    if (!itens.length) return '<div class="muted small">Sem vencimentos registrados.</div>';
    itens.sort((a,b) => new Date(a.validade) - new Date(b.validade));

    return `<div class="tbl-wrap"><table>
      <thead><tr><th>Item</th><th>Vencimento</th><th>Status</th></tr></thead>
      <tbody>${itens.map(i => {
        const d = this.daysUntil(i.validade);
        let cls='b-verde', txt='Regular';
        if (d < 0){ cls='b-vermelho'; txt=`Vencido (${Math.abs(d)}d)`; }
        else if (d <= 30){ cls='b-amarelo'; txt=`Vence em ${d}d`; }
        else if (d <= 60){ cls='b-amarelo'; txt=`Vence em ${d}d`; }
        return `<tr><td>${this.esc(i.nome)}</td><td>${this.fmtDate(i.validade)}</td><td><span class="badge ${cls}">${txt}</span></td></tr>`;
      }).join('')}</tbody></table></div>`;
  },

  // ---- CRUD genérico ----
  async crudPage(store, title, columns, extraActions=''){
    const rows = await this.db.getAll(store);
    const cfg = this.forms[store];
    const head = columns.map(c => `<th>${c.label}</th>`).join('') + '<th style="width:140px"></th>';
    const body = rows.length
      ? rows.map(r => `<tr>${columns.map(c => `<td>${c.render ? c.render.call(this, r) : this.esc(r[c.key] ?? '—')}</td>`).join('')}
          <td><div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-store="${store}" data-id="${r.id}">Editar</button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-store="${store}" data-id="${r.id}">🗑</button>
          </div></td></tr>`).join('')
      : `<tr><td colspan="${columns.length+1}" class="empty"><span class="big">📂</span>Nenhum registro.</td></tr>`;

    return `
      <div class="page-head">
        <div><h2>${title}</h2><div class="sub">${rows.length} registro(s)</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${extraActions}
          <button class="btn btn-ghost" data-action="export-csv" data-store="${store}">⬇ CSV</button>
          <button class="btn btn-primary" data-action="new" data-store="${store}">+ Novo</button>
        </div>
      </div>
      <div class="card"><div class="tbl-wrap"><table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div></div>
    `;
  },

  async pageEmpresas(){
    return this.crudPage('empresas','Empresas',[
      { key:'razaoSocial', label:'Razão Social' },
      { key:'nomeFantasia', label:'Nome Fantasia' },
      { key:'cnpj', label:'CNPJ' },
      { key:'cidade', label:'Cidade' },
      { key:'estado', label:'UF' },
      { key:'grauRisco', label:'GR', render:r => `<span class="badge b-azul">GR ${r.grauRisco||'—'}</span>` },
      { key:'numEmpregados', label:'Empregados' }
    ]);
  },

  async pageSetores(){
    return this.crudPage('setores','Setores',[
      { key:'nome', label:'Nome' },
      { key:'empresaId', label:'Empresa', render:r => this.esc(this.empresaNome(r.empresaId)) },
      { key:'atividade', label:'Atividade' },
      { key:'numTrabalhadores', label:'Nº Trab.' },
      { key:'jornada', label:'Jornada' }
    ]);
  },

  async pageTrabalhadores(){
    return this.crudPage('trabalhadores','Trabalhadores',[
      { key:'nome', label:'Nome' },
      { key:'matricula', label:'Matrícula' },
      { key:'cargo', label:'Cargo' },
      { key:'setorId', label:'Setor', render:r => this.esc(this.setorNome(r.setorId)) },
      { key:'admissao', label:'Admissão', render:r => this.fmtDate(r.admissao) },
      { key:'situacao', label:'Situação', render:r => `<span class="badge ${r.situacao==='Ativo'?'b-verde':'b-cinza'}">${r.situacao||'—'}</span>` }
    ]);
  },

  async pageRiscos(){
    const extra = `<button class="btn btn-ghost" data-action="new" data-store="inspecoes">📋 Inspeção</button>`;
    return this.crudPage('riscos','Inventário de Riscos — GRO/PGR',[
      { key:'perigo', label:'Perigo' },
      { key:'categoria', label:'Categoria', render:r => `<span class="badge b-azul">${r.categoria||'—'}</span>` },
      { key:'setorId', label:'Setor', render:r => this.esc(this.setorNome(r.setorId)) },
      { key:'nr', label:'NR', render:r => r.nr ? `<span class="tag-nr">${this.esc(r.nr)}</span>` : '—' },
      { key:'_r', label:'R (P×S)', render:r => {
        const c = this.riscoClassif(r.probabilidade, r.severidade);
        return `<strong>${c.r}</strong> <span class="badge ${c.badge}">${c.cls}</span>`;
      }},
      { key:'status', label:'Status' }
    ], extra);
  },

  async pageInspecoes(){
    return this.crudPage('inspecoes','Inspeções de Segurança',[
      { key:'data', label:'Data', render:r => this.fmtDate(r.data) },
      { key:'setorId', label:'Setor', render:r => this.esc(this.setorNome(r.setorId)) },
      { key:'inspetor', label:'Inspetor' },
      { key:'tipo', label:'Tipo' },
      { key:'itensConformes', label:'Conformes' },
      { key:'itensNaoConformes', label:'Não Conformes', render:r => `<span class="badge ${r.itensNaoConformes>0?'b-vermelho':'b-verde'}">${r.itensNaoConformes||0}</span>` }
    ]);
  },

  async pageNCs(){
    return this.crudPage('ncs','Não Conformidades',[
      { key:'codigo', label:'Código' },
      { key:'data', label:'Data', render:r => this.fmtDate(r.data) },
      { key:'descricao', label:'Descrição', render:r => this.esc((r.descricao||'').slice(0,60)) },
      { key:'nr', label:'NR', render:r => r.nr ? `<span class="tag-nr">${r.nr}</span>` : '—' },
      { key:'gravidade', label:'Gravidade', render:r => {
        const cls = r.gravidade==='Crítica'||r.gravidade==='Alta' ? 'b-vermelho' : r.gravidade==='Média' ? 'b-amarelo' : 'b-verde';
        return `<span class="badge ${cls}">${r.gravidade||'—'}</span>`;
      }},
      { key:'prazo', label:'Prazo', render:r => {
        if (!r.prazo) return '—';
        const d = this.daysUntil(r.prazo);
        const cls = d<0 ? 'b-vermelho' : d<=7 ? 'b-amarelo' : 'b-cinza';
        return `${this.fmtDate(r.prazo)} <span class="badge ${cls}">${d<0?`${Math.abs(d)}d atraso`:d+'d'}</span>`;
      }},
      { key:'status', label:'Status' }
    ]);
  },

  async pagePlanoAcao(){
    return this.crudPage('planoAcao','Plano de Ação 5W2H',[
      { key:'what', label:'O que' , render:r => this.esc((r.what||'').slice(0,50)) },
      { key:'who', label:'Quem' },
      { key:'when', label:'Quando', render:r => this.fmtDate(r.when) },
      { key:'prioridade', label:'Prioridade' },
      { key:'percentual', label:'%', render:r => `${r.percentual||0}%` },
      { key:'status', label:'Status' }
    ]);
  },

  async pageEpis(){
    return this.crudPage('epis','Controle de EPI — NR-06',[
      { key:'trabalhadorId', label:'Trabalhador', render:r => this.esc(this.trabNome(r.trabalhadorId)) },
      { key:'epi', label:'EPI' },
      { key:'ca', label:'CA' },
      { key:'dataEntrega', label:'Entrega', render:r => this.fmtDate(r.dataEntrega) },
      { key:'validade', label:'Validade', render:r => {
        if (!r.validade) return '—';
        const d = this.daysUntil(r.validade);
        const cls = d<0?'b-vermelho':d<=30?'b-amarelo':'b-verde';
        return `${this.fmtDate(r.validade)} <span class="badge ${cls}">${d<0?'Vencido':d+'d'}</span>`;
      }},
      { key:'treinamento', label:'Treinam.' }
    ]);
  },

  async pageTreinamentos(){
    return this.crudPage('treinamentos','Treinamentos',[
      { key:'trabalhadorId', label:'Trabalhador', render:r => this.esc(this.trabNome(r.trabalhadorId)) },
      { key:'treinamento', label:'Treinamento' },
      { key:'nr', label:'NR', render:r => r.nr ? `<span class="tag-nr">${r.nr}</span>` : '—' },
      { key:'cargaHoraria', label:'CH' },
      { key:'validade', label:'Validade', render:r => {
        if (!r.validade) return '—';
        const d = this.daysUntil(r.validade);
        const cls = d<0?'b-vermelho':d<=60?'b-amarelo':'b-verde';
        return `${this.fmtDate(r.validade)} <span class="badge ${cls}">${d<0?'Vencido':d+'d'}</span>`;
      }}
    ]);
  },

  async pageDocumentos(){
    return this.crudPage('documentos','Gestão de Documentos (GED)',[
      { key:'tipo', label:'Tipo', render:r => `<span class="badge b-azul">${r.tipo||'—'}</span>` },
      { key:'titulo', label:'Título' },
      { key:'versao', label:'Versão' },
      { key:'data', label:'Data', render:r => this.fmtDate(r.data) },
      { key:'responsavel', label:'Responsável' },
      { key:'validade', label:'Validade', render:r => {
        if (!r.validade) return '—';
        const d = this.daysUntil(r.validade);
        const cls = d<0?'b-vermelho':d<=60?'b-amarelo':'b-verde';
        return `${this.fmtDate(r.validade)} <span class="badge ${cls}">${d<0?'Vencido':d+'d'}</span>`;
      }}
    ]);
  },

  async pageNRs(){
    const nrs = window.NR_BASE.nrs;
    return `
      <div class="page-head">
        <div><h2>Base Normativa — NRs</h2>
        <div class="sub">Base atualizada em: ${window.NR_BASE.atualizadoEm} · versão ${window.NR_BASE.versao}</div></div>
      </div>
      <div class="card" style="background:#fff8e1;border-left:4px solid var(--amarelo)">
        <strong>⚠ Atenção:</strong> Esta base é modular e serve de referência. Requisitos técnicos devem sempre ser
        verificados no texto vigente da norma publicado pelo órgão competente. As decisões e conclusões técnicas
        são de responsabilidade do profissional legalmente habilitado.
      </div>
      ${nrs.map(nr => `
        <div class="card">
          <h3><span class="tag-nr">${nr.codigo}</span> ${this.esc(nr.titulo)}</h3>
          ${nr.itens && nr.itens.length ? `<div class="tbl-wrap"><table>
            <thead><tr><th style="width:90px">Item</th><th>Requisito</th><th style="width:280px">Observação</th></tr></thead>
            <tbody>${nr.itens.map(i => `<tr>
              <td><strong>${i.item}</strong></td>
              <td>${this.esc(i.requisito)}</td>
              <td><span class="badge b-amarelo">${this.esc(i.obs||'VERIFICAR TEXTO VIGENTE DA NORMA')}</span></td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<div class="muted small">Itens de checklist deste módulo podem ser adicionados conforme aplicabilidade.</div>'}
        </div>
      `).join('')}
    `;
  },

  async pageRelatorios(){
    const [emp, riscos, ncs, plano, trab] = await Promise.all([
      this.db.getAll('empresas'), this.db.getAll('riscos'),
      this.db.getAll('ncs'), this.db.getAll('planoAcao'), this.db.getAll('trabalhadores')
    ]);

    return `
      <div class="page-head">
        <div><h2>Relatórios</h2><div class="sub">Geração de documentos técnicos</div></div>
        <button class="btn btn-primary" data-action="print">🖨 Gerar PDF</button>
      </div>

      <div class="card" id="relatorio">
        <div style="text-align:center;border-bottom:2px solid var(--azul-escuro);padding-bottom:14px;margin-bottom:20px">
          <div style="font-size:12px;letter-spacing:2px;color:var(--azul);font-weight:700">APAVAN ENGENHARIA E CONSULTORIA</div>
          <h2 style="margin:6px 0;color:var(--azul-escuro)">RELATÓRIO TÉCNICO DE SST</h2>
          <div class="small muted">Emitido em ${new Date().toLocaleString('pt-BR')}</div>
        </div>

        <h3>1. Identificação da Empresa</h3>
        ${emp.map(e => `<div class="small" style="margin-bottom:10px">
          <strong>${this.esc(e.razaoSocial)}</strong>${e.nomeFantasia ? ' — '+this.esc(e.nomeFantasia) : ''}<br>
          CNPJ: ${this.esc(e.cnpj||'—')} · CNAE: ${this.esc(e.cnae||'—')} · Grau de Risco: ${this.esc(e.grauRisco||'—')}<br>
          ${this.esc(e.endereco||'')} ${this.esc(e.cidade||'')}/${this.esc(e.estado||'')} · ${e.numEmpregados||0} empregados<br>
          Responsável: ${this.esc(e.responsavel||'—')}
        </div>`).join('') || '<div class="muted small">Nenhuma empresa cadastrada.</div>'}

        <h3 class="mt-2">2. Inventário de Riscos (${riscos.length})</h3>
        ${riscos.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Perigo</th><th>Cat.</th><th>NR</th><th>P</th><th>S</th><th>R</th><th>Classif.</th></tr></thead>
          <tbody>${riscos.map(r => {
            const c = this.riscoClassif(r.probabilidade, r.severidade);
            return `<tr><td>${this.esc(r.perigo)}</td><td>${this.esc(r.categoria||'—')}</td>
              <td>${this.esc(r.nr||'—')}</td><td>${r.probabilidade}</td><td>${r.severidade}</td>
              <td><strong>${c.r}</strong></td><td><span class="badge ${c.badge}">${c.cls}</span></td></tr>`;
          }).join('')}</tbody></table></div>` : '<div class="muted small">Sem riscos cadastrados.</div>'}

        <h3 class="mt-2">3. Não Conformidades (${ncs.length})</h3>
        ${ncs.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>Código</th><th>Descrição</th><th>Gravidade</th><th>Prazo</th><th>Status</th></tr></thead>
          <tbody>${ncs.map(n => `<tr><td>${this.esc(n.codigo||'—')}</td>
            <td>${this.esc((n.descricao||'').slice(0,80))}</td>
            <td>${this.esc(n.gravidade||'—')}</td><td>${this.fmtDate(n.prazo)}</td>
            <td>${this.esc(n.status||'—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">Sem NCs.</div>'}

        <h3 class="mt-2">4. Plano de Ação (${plano.length})</h3>
        ${plano.length ? `<div class="tbl-wrap"><table>
          <thead><tr><th>O que</th><th>Quem</th><th>Quando</th><th>%</th><th>Status</th></tr></thead>
          <tbody>${plano.map(p => `<tr><td>${this.esc((p.what||'').slice(0,60))}</td>
            <td>${this.esc(p.who||'—')}</td><td>${this.fmtDate(p.when)}</td>
            <td>${p.percentual||0}%</td><td>${this.esc(p.status||'—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">Sem ações.</div>'}

        <div style="margin-top:36px;padding-top:20px;border-top:1px solid #ccc;font-size:12px">
          <div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap">
            <div>
              <div style="width:220px;border-top:1px solid #333;margin-top:50px;padding-top:6px;text-align:center">
                Responsável Técnico<br><span class="muted">CREA / Registro profissional</span>
              </div>
            </div>
            <div class="muted" style="text-align:right">
              Documento gerado pelo APAVAN SST<br>
              APAVAN ENGENHARIA E CONSULTORIA<br>
              Revisão 00 — ${new Date().toLocaleDateString('pt-BR')}
            </div>
          </div>
          <p class="small muted mt-2" style="font-style:italic">
            Este relatório reflete os registros realizados no sistema. As conclusões técnicas e a responsabilidade
            profissional permanecem com o responsável legalmente habilitado.
          </p>
        </div>
      </div>
    `;
  },

  async pageConfig(){
    const counts = await Promise.all(STORES.map(async s => `${s}: ${(await this.db.getAll(s)).length}`));
    return `
      <div class="page-head"><div><h2>Configurações</h2><div class="sub">Sistema · Dados · Backups</div></div></div>

      <div class="card">
        <h3>Backup e Restauração</h3>
        <p class="muted small mb-2">Exportar/importar toda a base local em JSON.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" data-action="backup">⬇ Exportar backup</button>
          <button class="btn btn-ghost" data-action="restore">⬆ Restaurar backup</button>
          <button class="btn btn-danger" data-action="seed-reset">♻ Resetar para demonstração</button>
        </div>
      </div>

      <div class="card">
        <h3>Base Normativa</h3>
        <p class="small">Versão: <strong>${window.NR_BASE.versao}</strong> · Atualizada em <strong>${window.NR_BASE.atualizadoEm}</strong></p>
        <p class="small muted mt-1">Mantenha a base atualizada conforme publicação oficial do MTE. Nunca consideramos a norma como permanente.</p>
      </div>

      <div class="card">
        <h3>Registros armazenados (IndexedDB)</h3>
        <ul class="small" style="list-style:none;columns:2">
          ${counts.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>

      <div class="card">
        <h3>Perfis de acesso (planejados)</h3>
        <p class="small muted">A arquitetura prevê perfis Administrador, Engenheiro, Técnico SST, Gestor e Cliente. Autenticação e sincronização remota podem ser conectadas a um backend (Firebase, Supabase, API própria).</p>
      </div>

      <div class="card" style="background:#fff8e1;border-left:4px solid var(--amarelo)">
        <strong>Aviso técnico:</strong> Os conteúdos normativos aqui apresentados devem sempre ser verificados no texto vigente. A IA assistiva (quando ativada) não substitui o profissional legalmente habilitado.
      </div>
    `;
  }
};

// =================== BOOT ===================
window.addEventListener('DOMContentLoaded', () => App.init());