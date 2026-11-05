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

**Conta**:
Credencial de acesso (email + senha) ligada a um Titular e a um perfil (AGRICULTOR ou TECNICO).
_Avoid_: Utilizador genérico, login, user

**Titular**:
Pessoa a quem a Conta pertence (nome completo); pode ter Organização associada.
_Avoid_: Dono, owner, account holder

**Organização**:
Unidade ou entidade do Titular (cooperativa, UEM, associação), opcional na Conta.
_Avoid_: Empresa, instituição (quando se refere ao campo da conta)
