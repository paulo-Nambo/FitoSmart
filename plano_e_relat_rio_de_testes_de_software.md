# Plano e Relatório de Testes de Software

**Curso:** Licenciatura em Informática — Engenharia de Software (3.º Ano)  
**Instituição:** Universidade Eduardo Mondlane (UEM) — Faculdade de Ciências / DMI  
**Projeto:** FitoSmart — Sistema Inteligente de Alerta Precoce e Apoio à Decisão em Fitossanidade (MVP)  
**Autores:** Paulo Baltazar & Osama Mahomed  
**Suíte automatizada:** `tests/fitossanidade.test.ts`  
**Comando:** `npm test` (`jest --coverage --verbose`)

---

## 1. Visão Geral e Âmbito (E1)

Este documento define o **plano de testes**, a **matriz de casos** e o **relatório de execução** do MVP FitoSmart. O objectivo é garantir que as regras críticas do domínio fitossanitário e de segurança de acesso estão cobertas por testes automatizados, reproduzíveis e integrados em CI.

### 1.1 Objectivos

| Objectivo | Descrição |
| :--- | :--- |
| Correctude de entrada | Validar email, senha e coordenadas antes de persistir dados |
| Regras de negócio | Triagem automática (`TRIADA` / `ENCAMINHADA`) com limiar de 60 % |
| Segurança de acesso | Autenticação JWT e RBAC na validação técnica |
| Ciclo de vida | Ocorrência → triagem → validação por técnico |
| Regressão contínua | Executar a suíte em cada `push` / `pull_request` via GitHub Actions |

### 1.2 Em âmbito

- Validação de campos (email, senha de login, latitude/longitude, sintomas)
- Autenticação (`POST /api/login`) e JWT
- Política de senha reforçada (criar / alterar)
- Actualização do titular da conta (`PATCH /api/conta`)
- Motor de triagem (`calcularTriagem`)
- Registo de ocorrência sem sintomas (`POST /api/ocorrencias`)
- Validação técnica com RBAC (`POST /api/validacoes`)

### 1.3 Fora de âmbito (nesta suíte)

- Diagnóstico por imagem (OpenEPI / Ollama LLaVA / Gemini) — coberto por verificação manual / smoke
- Interface React (E2E browser) — fora do Jest actual
- Performance, carga e penetração

### 1.4 Stack sob teste

| Camada | Tecnologia |
| :--- | :--- |
| Front-end | React + TypeScript (Vite) |
| Back-end | Node.js + Express + TypeScript |
| Persistência | PostgreSQL (`DATABASE_URL`); memória nos testes via `reporEstado()` |
| Testes | Jest + Supertest |
| CI/CD | GitHub Actions (`.github/workflows/test.yml`) |

---

## 2. Estratégia e Técnicas (E2)

| Técnica | Aplicação nos casos |
| :--- | :--- |
| Partição de equivalência | T01 — email com/sem `@` |
| Análise de valores de fronteira | T02 (senha 5 vs ≥6), T04 (lat > 90), T05 (lng = −180) |
| Caminho feliz | T03, T07, T10 |
| Regra de negócio negativa / defeito | T06, T09 |
| Modelagem de estados | T07/T08 (triagem) → T10 (`ENCAMINHADA` → `VALIDADA`) |
| Política de segurança | Extensão: senha reforçada, edição de perfil, alteração de senha |

**Critério de passagem da suíte:** todos os testes verdes; cobertura reportada pelo Jest sem falhas.

---

## 3. Matriz dos 10 Casos Principais (E3)

| ID | Nível | Componente / Regra | Técnica | Entrada / Acção | Resultado esperado | Evidência no código |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T01** | Unitário | Validação de email | Partição | `paulo.baltazar.uem.mz` (sem `@`) | `emailValido` → `false` | `emailValido()` |
| **T02** | Unitário | Senha de login | Fronteira | `"12345"` (mínimo = 6) | `senhaValida` → `false` | `senhaValida()` |
| **T03** | Integração | Login JWT | Caminho feliz | `paulo.baltazar@uem.mz` / `FitoSmart1!` | HTTP 200 + JWT com `email` e `perfil: ADMIN_SISTEMA` | `POST /api/login` |
| **T04** | Unitário | Latitude | Fronteira inválida | `latitude: 95.0` | `"Latitude fora dos limites (-90 a 90)"` | `validarCamposOcorrencia` |
| **T05** | Unitário | Longitude | Fronteira válida | `longitude: -180.0` | Sem erro (`null`) | `validarCamposOcorrencia` |
| **T06** | Integração | Sintomas obrigatórios | Defeito | `sintomas: []` | HTTP 400: `"Deve informar ao menos 1 sintoma"` | `POST /api/ocorrencias` |
| **T07** | Regra | Triagem 100 % | Coincidência total | Input = ficha (`manchas_amarelas`, `folhas_secas`) | `confianca: 100`, `status: TRIADA` | `calcularTriagem` |
| **T08** | Regra | Encaminhamento | Limiar &lt; 60 % | 1/2 sintomas → 50 % | `confianca: 50`, `status: ENCAMINHADA` | `calcularTriagem` |
| **T09** | Integração | RBAC negativo | Negativo | Cabeçalho `x-user-role: AGRICULTOR` | HTTP 403 com `"Requer perfil TECNICO"` | `POST /api/validacoes` |
| **T10** | Integração | Validação técnica | Mudança de estado | 1) `AGRICULTOR` regista 1 sintoma → `ENCAMINHADA`; 2) `TECNICO` valida com `id` | HTTP 201 + `ENCAMINHADA`; depois HTTP 200 + `VALIDADA` | `POST /api/ocorrencias` → `POST /api/validacoes` |

### 3.1 Extensões de segurança (já implementadas na suíte)

Estes casos reforçam a conta de arranque e a política de senha; complementam T01–T10 sem substituí-los. Ordem no ficheiro Jest: T01–T03, T11–T13, T04–T10.

| ID | Nome no Jest | Entrada / Acção | Resultado esperado |
| :--- | :--- | :--- | :--- |
| **T11** | `T11 [Campo]: Nova senha fraca…` | `"123456"`, `"abcdefg1"` vs `"FitoSmart1!"` | Fracas → `false`; forte → `true` (`senhaNovaValida`) |
| **T12** | `T12 [Integração]: Editar perfil…` | `PATCH /api/conta` sem token / com Bearer | 401 sem sessão; 200 com nome e organização |
| **T13** | `T13 [Integração]: Alterar senha…` | `POST /api/conta/senha` (fraca / actual errada / ok) | 400 / 401 / 200 + login com a nova senha (restauro no `finally`) |

---

## 4. Implementação Automatizada (E4)

A implementação oficial vive em **`tests/fitossanidade.test.ts`**. Usa a app real (`criarApp()`), credenciais de arranque (`CONTA_ADMIN_SISTEMA`) e `reporEstado()` em `beforeEach` para isolamento.

### 4.1 Como executar

```bash
npm test
```

Equivalente: `npx jest --coverage --verbose`.

### 4.2 Mapeamento teste → especificação

| Caso | Nome do teste em Jest |
| :--- | :--- |
| T01 | `T01 [Campo]: Deve rejeitar email sem caractere @` |
| T02 | `T02 [Fronteira]: Deve rejeitar senha com menos de 6 caracteres` |
| T03 | `T03 [Integração]: Deve gerar token ao efetuar login válido` |
| T04 | `T04 [Fronteira]: Deve emitir erro para Latitude > 90` |
| T05 | `T05 [Fronteira]: Deve aceitar Longitude no limite exato de -180` |
| T06 | `T06 [Regra]: Deve bloquear registro de ocorrência sem sintomas` |
| T07 | `T07 [Regra]: Deve calcular 100% de confiança quando todos os sintomas coincidirem` |
| T08 | `T08 [Regra]: Deve encaminhar para técnico se confiança for < 60%` |
| T09 | `T09 [RBAC]: Agricultor não deve conseguir validar ocorrência (403)` |
| T10 | `T10 [Integração]: Técnico autorizado altera status da ocorrência para VALIDADA` |
| T11 | `T11 [Campo]: Nova senha fraca é rejeitada pela política reforçada` |
| T12 | `T12 [Integração]: Editar perfil actualiza titular da conta autenticada` |
| T13 | `T13 [Integração]: Alterar senha exige senha actual e aceita nova senha válida` |

> Nota: o plano antigo continha exemplos *simulados* (ex.: T03 a comparar a senha com `"123456"`). A suíte actual valida o JWT real com `jsonwebtoken` e `JWT_SECRET`.

---

## 5. Cenários de Aceitação — Gherkin (E5)

### Cenário 1 — Triagem com baixa confiança

```gherkin
Dado que a ficha base da doença exige "manchas_amarelas" e "folhas_secas"
E que o agricultor seleccionou apenas "manchas_amarelas"
Quando o motor de triagem calcula a confiança
Então a confiança é 50 %
E o estado da ocorrência fica ENCAMINHADA
E o caso requer revisão humana (técnico)
```

### Cenário 2 — Protecção RBAC da validação

```gherkin
Dado que o pedido envia o perfil AGRICULTOR
Quando é feito POST /api/validacoes
Então a resposta é 403 Forbidden
E a mensagem contém "Requer perfil TECNICO"
```

### Cenário 3 — Login do administrador do sistema

```gherkin
Dado que existem as credenciais paulo.baltazar@uem.mz / FitoSmart1!
Quando é feito POST /api/login com essas credenciais
Então a resposta é 200
E o corpo inclui um token JWT
E o payload contém email e perfil ADMIN_SISTEMA
```

### Cenário 4 — Alteração de senha segura

```gherkin
Dado que a conta paulo.baltazar@uem.mz existe
Quando se tenta uma senha nova fraca
Então o sistema responde 400
Quando a senha actual está incorrecta
Então o sistema responde 401
Quando a senha actual está correcta e a nova cumpre a política
Então o sistema responde 200
E o login com a nova senha sucede
```

---

## 6. Ambiente, Dados e Pré-condições

| Item | Valor |
| :--- | :--- |
| Conta de arranque | `paulo.baltazar@uem.mz` / `FitoSmart1!` (`ADMIN_SISTEMA`) |
| Ficha base (triagem) | Sintomas: `manchas_amarelas`, `folhas_secas` |
| Limiar de triagem | ≥ 60 % → `TRIADA`; &lt; 60 % → `ENCAMINHADA` |
| Isolamento | `beforeEach(() => reporEstado())` |
| Variável JWT | `JWT_SECRET` (definida no ambiente de teste / `.env`) |

---

## 7. Pipeline CI/CD (E6)

Ficheiro: `.github/workflows/test.yml`

| Gatilho | Acção |
| :--- | :--- |
| `push` em `main` ou `dev` | Checkout → Node 20 → `npm ci` → Jest com cobertura |
| `pull_request` para `main` | Idem |

Critério de merge recomendado: job `build-and-test` verde.

---

## 8. Relatório de Execução (modelo)

Preencher após cada entrega / demonstração:

| Campo | Valor |
| :--- | :--- |
| Data | _aaaa-mm-dd_ |
| Commit / branch | _hash ou nome_ |
| Comando | `npm test` |
| T01–T10 | Passou / Falhou |
| T11–T13 | Passou / Falhou |
| Cobertura (statements) | _% reportada pelo Jest_ |
| Observações | _ex.: diagnóstico por imagem verificado manualmente_ |

### Resultado da suíte (referência)

A suíte oficial em `tests/fitossanidade.test.ts` cobre **T01–T10** e as extensões **T11–T13**. Um resultado verde com `npm test` constitui evidência de conformidade com este plano.

---

## 9. Riscos e Mitigações

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Drift entre plano e código | Testes “no papel” desactualizados | Matriz aponta para nomes exactos em Jest |
| Dependência de BD nos testes de integração | Flaky CI | `reporEstado()` e app em memória quando aplicável |
| Diagnóstico por IA não coberto | Regressões de visão não detectadas | Smoke manual; futuro teste de contrato do `/api/diagnostico` |
| Credenciais de demo no repositório | Uso indevido | Conta apenas local de arranque; senha alterável na UI |

---

## 10. Considerações Finais

O plano minimalista prioriza o ciclo de vida da ocorrência e o controlo de acesso — o núcleo académico do MVP. A suíte automatizada reflecte a implementação real (Express + JWT + triagem + RBAC) e corre em CI. Extensões de conta (perfil e senha) aumentam a robustez sem diluir os 10 casos exigidos pela disciplina.

**Próximos melhoramentos sugeridos (opcional):** testes E2E do formulário de ocorrência; contrato do endpoint de diagnóstico de imagem; matriz RBAC completa para `ADMIN_CONTAS` / `ADMIN_CONFIG` / `ADMIN_SISTEMA`.
