# FitoSmart

Contexto de alerta precoce e apoio à decisão em fitossanidade (UEM): registo de casos no campo, triagem automática e validação técnica.

## Language

**Ocorrência**:
Registo de um problema fitossanitário observado numa cultura, com sintomas, localização e estado de triagem.
_Avoid_: Caso genérico, ticket, incidente, log

**Parcela**:
Sítio nomeado e reutilizável (talhão, bloco, zona) onde ocorrem observações; separado das coordenadas pontuais do registo.
_Avoid_: Localização, asset, farm, campo (quando se refere ao sítio permanente)

**Referência**:
Entrada canónica do catálogo de pragas/doenças (id estável, rótulo, nome científico e imagens).
_Avoid_: Diagnóstico (resultado pontual), hipótese, label livre

**Severidade**:
Grau 1–5 da extensão do problema no talhão no momento do registo.
_Avoid_: Confiança, prioridade, urgência

**Confiança**:
Percentagem da triagem automática face à ficha base de sintomas; decide TRIADA vs ENCAMINHADA.
_Avoid_: Severidade, probabilidade da IA de visão (embora a IA também reporte um valor próprio)

**Triagem**:
Classificação automática da ocorrência em TRIADA (≥60 % de confiança) ou ENCAMINHADA (<60 %).
_Avoid_: Diagnóstico, validação

**Validação**:
Confirmação por técnico de uma ocorrência ENCAMINHADA, com marca temporal (`validada_em`).
_Avoid_: Triagem, aprovação genérica

**Diagnóstico**:
Resultado de análise de imagem (motor OpenEPI / Ollama / Gemini / fallback local), podendo ligar a uma Referência.
_Avoid_: Ocorrência, triagem

**Pedido de apoio**:
Canal de mensagens entre Agricultor e Técnico/Gestor sobre uma Ocorrência concreta, com estados ABERTO → EM_ATENDIMENTO → ENCERRADO. Todo pedido referencia uma Ocorrência e pode opcionalmente atribuir um Técnico/agronómio concreto.
_Avoid_: Ticket, chat genérico, issue, suporte IT

**Avaliação do técnico**:
Classificação de 1 a 5 estrelas que o Agricultor atribui a um Técnico/Gestor após um Pedido de apoio ENCERRADO (uma avaliação por pedido).
_Avoid_: Review genérico, like, feedback IT

**Ranking de técnicos**:
Ordenação dos técnicos/agronómios pela média das Avaliações e pelo número de assistências avaliadas.
_Avoid_: Leaderboard gamificado, score arbitrário

**Conta**:
Credencial de acesso (email + senha) ligada a um Titular e a um Perfil.
_Avoid_: Utilizador genérico, login, user

**Titular**:
Pessoa a quem a Conta pertence (nome completo); pode ter Organização associada.
_Avoid_: Dono, owner, account holder

**Organização**:
Unidade ou entidade do Titular (cooperativa, UEM, associação), opcional na Conta.
_Avoid_: Empresa, instituição (quando se refere ao campo da conta)

**Perfil**:
Papel único da Conta: AGRICULTOR (Worker), TECNICO (validação de campo), GESTOR (Manager), VISUALIZADOR (Viewer), ADMIN_CONTAS (Account Admin), ADMIN_CONFIG (Config Admin) ou ADMIN_SISTEMA (Administrador do sistema — gestão de contas e configuração). A conta de arranque é Paulo Baltazar (`paulo.baltazar@uem.mz`).
_Avoid_: Role combinável, permissão solta, admin genérico, contas de demonstração

**Janela operacional**:
Intervalo em que a pulverização é FAVORAVEL, CONDICIONAL ou DESFAVORAVEL, segundo Delta-T, chuva, vento e estado hídrico do solo.
_Avoid_: Slot genérico, availability, weather OK

**Memória agrícola**:
Sequência recente de estados hídricos (SECO / HUMIDO / SATURADO / CHUVOSO) usada pela cadeia de Markov para estimar persistência climática e acumulação hídrica.
_Avoid_: Histórico genérico, cache, log meteorológico

**Delta-T**:
Diferença bulbo seco − bulbo húmido (°C); indica risco de evaporação (>10) ou deriva (<2) do defensivo.
_Avoid_: Temperatura simples, feeling, heat index

**Telemetria de pulverização**:
Painel com pressão atmosférica (hPa), Delta-T, mapa de calor regional de chuva e janelas Markov para apoiar a decisão de pulverizar.
_Avoid_: Dashboard IoT genérico, sensores de máquina

**Alerta SMS 2G**:
Resposta textual curta (≤160 caracteres) a comandos JANELA / DELTAT / CHUVA / PRESSAO, para acessibilidade em redes 2G sem app.
_Avoid_: Push, WhatsApp, notificação in-app
