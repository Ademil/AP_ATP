/* ===== Base Normativa — Estrutura Modular =====
   IMPORTANTE: NUNCA INVENTAR REQUISITOS.
   Onde não houver certeza, marcar "VERIFICAR TEXTO VIGENTE DA NORMA".
   Atualize esta base conforme publicação oficial do MTE.
*/
window.NR_BASE = {
  versao: '2024-11',
  atualizadoEm: '2024-11-01',
  nrs: [
    { codigo:'NR-01', titulo:'Disposições Gerais e Gerenciamento de Riscos Ocupacionais',
      itens:[
        { item:'1.5.1', requisito:'O GRO deve ser implementado por estabelecimento.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'1.5.4', requisito:'Identificação de perigos e avaliação de riscos ocupacionais.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-03', titulo:'Embargo e Interdição', itens:[] },
    { codigo:'NR-04', titulo:'Serviços Especializados em Segurança e Medicina do Trabalho (SESMT)', itens:[] },
    { codigo:'NR-05', titulo:'Comissão Interna de Prevenção de Acidentes e de Assédio (CIPA)', itens:[] },
    { codigo:'NR-06', titulo:'Equipamento de Proteção Individual (EPI)',
      itens:[
        { item:'6.6.1', requisito:'Todo EPI deve possuir CA (Certificado de Aprovação) válido.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'6.7.1', requisito:'Registro de entrega de EPI com assinatura do trabalhador.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-07', titulo:'Programa de Controle Médico de Saúde Ocupacional (PCMSO)', itens:[] },
    { codigo:'NR-08', titulo:'Edificações', itens:[] },
    { codigo:'NR-09', titulo:'Avaliação e Controle das Exposições Ocupacionais a Agentes Físicos, Químicos e Biológicos', itens:[] },
    { codigo:'NR-10', titulo:'Segurança em Instalações e Serviços em Eletricidade',
      itens:[
        { item:'10.2.1', requisito:'Prontuário das instalações elétricas.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'10.8.1', requisito:'Trabalhadores autorizados e capacitados.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-11', titulo:'Transporte, Movimentação, Armazenagem e Manuseio de Materiais', itens:[] },
    { codigo:'NR-12', titulo:'Segurança no Trabalho em Máquinas e Equipamentos',
      itens:[
        { item:'12.38', requisito:'Proteções fixas/móveis em partes móveis acessíveis.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'12.56', requisito:'Parada de emergência acessível ao operador.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-13', titulo:'Caldeiras, Vasos de Pressão, Tubulações e Tanques Metálicos de Armazenamento', itens:[] },
    { codigo:'NR-14', titulo:'Fornos', itens:[] },
    { codigo:'NR-15', titulo:'Atividades e Operações Insalubres', itens:[] },
    { codigo:'NR-16', titulo:'Atividades e Operações Perigosas', itens:[] },
    { codigo:'NR-17', titulo:'Ergonomia',
      itens:[
        { item:'17.4', requisito:'Avaliação ergonômica preliminar das atividades.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'17.5', requisito:'Análise Ergonômica do Trabalho (AET) quando aplicável.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-18', titulo:'Segurança e Saúde no Trabalho na Indústria da Construção', itens:[] },
    { codigo:'NR-19', titulo:'Explosivos', itens:[] },
    { codigo:'NR-20', titulo:'Segurança com Inflamáveis e Combustíveis', itens:[] },
    { codigo:'NR-21', titulo:'Trabalhos a Céu Aberto', itens:[] },
    { codigo:'NR-22', titulo:'Segurança e Saúde Ocupacional na Mineração', itens:[] },
    { codigo:'NR-23', titulo:'Proteção Contra Incêndios',
      itens:[
        { item:'23.1', requisito:'Saídas de emergência desobstruídas e sinalizadas.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-24', titulo:'Condições Sanitárias e de Conforto nos Locais de Trabalho', itens:[] },
    { codigo:'NR-25', titulo:'Resíduos Industriais', itens:[] },
    { codigo:'NR-26', titulo:'Sinalização de Segurança', itens:[] },
    { codigo:'NR-28', titulo:'Fiscalização e Penalidades', itens:[] },
    { codigo:'NR-29', titulo:'Segurança e Saúde no Trabalho Portuário', itens:[] },
    { codigo:'NR-30', titulo:'Segurança e Saúde no Trabalho Aquaviário', itens:[] },
    { codigo:'NR-31', titulo:'Segurança e Saúde no Trabalho na Agricultura, Pecuária, Silvicultura, Exploração Florestal e Aquicultura', itens:[] },
    { codigo:'NR-32', titulo:'Segurança e Saúde no Trabalho em Serviços de Saúde', itens:[] },
    { codigo:'NR-33', titulo:'Segurança e Saúde nos Trabalhos em Espaços Confinados',
      itens:[
        { item:'33.3', requisito:'Permissão de Entrada e Trabalho (PET) emitida.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'33.5', requisito:'Monitoramento atmosférico contínuo.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-34', titulo:'Condições e Meio Ambiente de Trabalho na Indústria da Construção, Reparação e Desmonte Naval', itens:[] },
    { codigo:'NR-35', titulo:'Trabalho em Altura',
      itens:[
        { item:'35.3', requisito:'Análise de Risco e Permissão de Trabalho.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' },
        { item:'35.4', requisito:'Sistema de ancoragem e EPI adequados.', obs:'VERIFICAR TEXTO VIGENTE DA NORMA' }
      ]},
    { codigo:'NR-36', titulo:'Segurança e Saúde no Trabalho em Empresas de Abate e Processamento de Carnes e Derivados', itens:[] },
    { codigo:'NR-37', titulo:'Segurança e Saúde em Plataformas de Petróleo', itens:[] },
    { codigo:'NR-38', titulo:'Segurança e Saúde no Trabalho em Atividades de Limpeza Urbana e Manejo de Resíduos Sólidos', itens:[] }
  ]
};