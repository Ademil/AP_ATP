/* ===== APAVAN SST — Camada de dados (IndexedDB) ===== */
const DB_NAME = 'apavan_sst_db';
const DB_VERSION = 1;
const STORES = [
  'empresas','estabelecimentos','setores','trabalhadores','riscos',
  'inspecoes','ncs','planoAcao','epis','treinamentos','documentos','logs','config'
];

class Database {
  constructor(){ this.db = null; }

  open(){
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
          }
        });
      };
      req.onsuccess = e => { this.db = e.target.result; res(); };
      req.onerror = e => rej(e.target.error);
    });
  }

  _tx(store, mode='readonly'){ return this.db.transaction(store, mode).objectStore(store); }

  add(store, data){
    return new Promise((res, rej) => {
      const r = this._tx(store,'readwrite').add({ ...data, criadoEm: new Date().toISOString() });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  put(store, data){
    return new Promise((res, rej) => {
      const r = this._tx(store,'readwrite').put({ ...data, atualizadoEm: new Date().toISOString() });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  get(store, id){
    return new Promise((res, rej) => {
      const r = this._tx(store).get(Number(id));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  getAll(store){
    return new Promise((res, rej) => {
      const r = this._tx(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }
  delete(store, id){
    return new Promise((res, rej) => {
      const r = this._tx(store,'readwrite').delete(Number(id));
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }
  clear(store){
    return new Promise((res, rej) => {
      const r = this._tx(store,'readwrite').clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }

  async seedIfEmpty(){
    const emp = await this.getAll('empresas');
    if (emp.length) return;

    // Empresa demo
    const empresaId = await this.add('empresas', {
      razaoSocial: 'Indústria Modelo LTDA',
      nomeFantasia: 'Indústria Modelo',
      cnpj: '12.345.678/0001-90',
      cnae: '25.11-0-00',
      grauRisco: '3',
      endereco: 'Av. Industrial, 1000',
      cidade: 'São Paulo', estado: 'SP',
      telefone: '(11) 4000-0000', email: 'sst@modelo.com.br',
      responsavel: 'Eng. Carlos Silva',
      numEmpregados: 120,
      atividade: 'Fabricação de estruturas metálicas'
    });

    // Setores
    const setorProd = await this.add('setores', {
      empresaId, nome: 'Produção', descricao: 'Linha de montagem',
      atividade: 'Corte, solda e montagem', numTrabalhadores: 40, jornada: '08:00-17:00'
    });
    const setorManut = await this.add('setores', {
      empresaId, nome: 'Manutenção', descricao: 'Manutenção elétrica e mecânica',
      atividade: 'Intervenções em máquinas e instalações', numTrabalhadores: 15, jornada: '08:00-17:00'
    });
    await this.add('setores', {
      empresaId, nome: 'Administrativo', descricao: 'Setor administrativo',
      atividade: 'Trabalho em escritório', numTrabalhadores: 20, jornada: '09:00-18:00'
    });

    // Trabalhadores
    await this.add('trabalhadores', { nome:'João Pereira', matricula:'001', cargo:'Soldador', setorId:setorProd, funcao:'Solda MIG/MAG', admissao:'2022-03-15', situacao:'Ativo' });
    await this.add('trabalhadores', { nome:'Maria Souza', matricula:'002', cargo:'Eletricista', setorId:setorManut, funcao:'Manutenção elétrica', admissao:'2021-08-01', situacao:'Ativo' });
    await this.add('trabalhadores', { nome:'Pedro Lima', matricula:'003', cargo:'Analista Administrativo', setorId:null, funcao:'Rotinas administrativas', admissao:'2020-01-20', situacao:'Ativo' });

    // Riscos
    await this.add('riscos', {
      setorId: setorProd, atividade:'Solda de estruturas metálicas',
      perigo:'Radiação não ionizante (arco voltaico)', fonte:'Processo de solda',
      consequencia:'Queimaduras oculares, lesões de pele', categoria:'Físico',
      probabilidade: 4, severidade: 3, nr: 'NR-09', medidasExistentes:'Máscara de solda com filtro, biombos',
      medidasPropostas:'Treinamento periódico, sinalização', responsavel:'Carlos Silva', status:'Aberto'
    });
    await this.add('riscos', {
      setorId: setorProd, atividade:'Movimentação de peças',
      perigo:'Queda de materiais / sobrecarga', fonte:'Içamento manual',
      consequencia:'Lesões musculoesqueléticas', categoria:'Ergonômico',
      probabilidade: 4, severidade: 3, nr: 'NR-17', medidasExistentes:'Treinamento, dispositivos auxiliares',
      medidasPropostas:'Análise ergonômica detalhada', responsavel:'Carlos Silva', status:'Em análise'
    });
    await this.add('riscos', {
      setorId: setorManut, atividade:'Intervenção em painéis elétricos',
      perigo:'Choque elétrico / arco elétrico', fonte:'Instalações energizadas',
      consequencia:'Eletrocussão, queimaduras graves', categoria:'Acidente',
      probabilidade: 3, severidade: 5, nr: 'NR-10', medidasExistentes:'Bloqueio, EPI dielétrico',
      medidasPropostas:'Revisão de procedimentos, treinamento reciclagem',
      responsavel:'Carlos Silva', status:'Aberto'
    });

    // EPI
    await this.add('epis', { trabalhadorId:1, epi:'Máscara de solda automática', ca:'12345', fabricante:'3M', dataEntrega:'2024-06-01', quantidade:1, validade:'2026-06-01', treinamento:'OK' });
    await this.add('epis', { trabalhadorId:2, epi:'Luva isolante classe 2', ca:'33456', fabricante:'Protec', dataEntrega:'2024-02-10', quantidade:2, validade:'2025-02-10', treinamento:'OK' });

    // Treinamentos
    await this.add('treinamentos', { trabalhadorId:2, treinamento:'NR-10 Básico', nr:'NR-10', cargaHoraria:40, instrutor:'Eng. Ana Costa', data:'2023-08-10', validade:'2025-08-10', certificado:'CERT-001' });
    await this.add('treinamentos', { trabalhadorId:1, treinamento:'NR-35 Trabalho em Altura', nr:'NR-35', cargaHoraria:8, instrutor:'Téc. Roberto', data:'2024-01-15', validade:'2026-01-15', certificado:'CERT-002' });

    // Documentos
    await this.add('documentos', { tipo:'PGR', titulo:'PGR — 2024', versao:'02', data:'2024-01-15', responsavel:'Carlos Silva', validade:'2025-01-15' });
    await this.add('documentos', { tipo:'PCMSO', titulo:'PCMSO — 2024', versao:'01', data:'2024-03-01', responsavel:'Dr. Marcos', validade:'2025-03-01' });
    await this.add('documentos', { tipo:'LTCAT', titulo:'LTCAT — 2023', versao:'01', data:'2023-06-10', responsavel:'Carlos Silva', validade:'2024-06-10' });

    // NC
    await this.add('ncs', {
      codigo:'NC-001', data: new Date().toISOString().slice(0,10),
      local:'Produção', setorId: setorProd,
      descricao:'Ausência de proteção fixa em transmissão de correia',
      nr:'NR-12', requisito:'VERIFICAR TEXTO VIGENTE DA NORMA',
      gravidade:'Alta', responsavel:'Carlos Silva',
      prazo: new Date(Date.now()+15*864e5).toISOString().slice(0,10),
      acaoCorretiva:'Instalar proteção fixa conforme NR-12',
      status:'Aberta'
    });

    // Plano de Ação
    await this.add('planoAcao', {
      what:'Instalar proteção fixa na transmissão', why:'Eliminar risco de aprisionamento',
      where:'Setor Produção', when: new Date(Date.now()+15*864e5).toISOString().slice(0,10),
      who:'Manutenção', how:'Aquisição e instalação de proteção metálica',
      howMuch:'R$ 2.500,00', prioridade:'Alta', percentual: 20, status:'Em execução'
    });

    await this.add('logs', { tipo:'seed', mensagem:'Base de demonstração inicializada', data: new Date().toISOString() });
  }
}