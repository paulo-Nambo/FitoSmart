import request from 'supertest';
import jwt from 'jsonwebtoken';
import { emailValido, senhaValida } from '../src/auth';
import { criarApp } from '../src/app';
import { CONTA_ADMIN_SISTEMA } from '../src/credenciais';
import {
  calcularTriagem,
  reporEstado,
  validarCamposOcorrencia,
} from '../src/fitossanidade';
import { senhaNovaValida } from '../src/senha';
import {
  avaliarJanela,
  calcularDeltaT,
  classificarEstadoHidrico,
  estimarMatrizTransicao,
  responderSms,
  truncarSms,
  type PainelOperacional,
} from '../src/operacional';

const app = criarApp();

beforeEach(() => {
  reporEstado();
});

describe('Suíte de 10 Testes do MVP Fitossanitário (UEM - Eng. Software)', () => {
  test('T01 [Campo]: Deve rejeitar email sem caractere @', () => {
    expect(emailValido('paulo.baltazar.uem.mz')).toBe(false);
  });

  test('T02 [Fronteira]: Deve rejeitar senha com menos de 6 caracteres', () => {
    expect(senhaValida('12345')).toBe(false);
  });

  test('T03 [Integração]: Deve gerar token ao efetuar login válido', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: CONTA_ADMIN_SISTEMA.email, senha: CONTA_ADMIN_SISTEMA.senha });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET as string);
    expect(payload).toMatchObject({
      email: CONTA_ADMIN_SISTEMA.email,
      perfil: 'ADMIN_SISTEMA',
    });
  });

  test('T11 [Campo]: Nova senha fraca é rejeitada pela política reforçada', () => {
    expect(senhaNovaValida('123456')).toBe(false);
    expect(senhaNovaValida('abcdefg1')).toBe(false);
    expect(senhaNovaValida('FitoSmart1!')).toBe(true);
  });

  test('T12 [Integração]: Editar perfil actualiza titular da conta autenticada', async () => {
    const login = await request(app)
      .post('/api/login')
      .send({ email: CONTA_ADMIN_SISTEMA.email, senha: CONTA_ADMIN_SISTEMA.senha });
    expect(login.status).toBe(200);

    const semSessao = await request(app).patch('/api/conta').send({ nome: 'Outro Nome' });
    expect(semSessao.status).toBe(401);

    const ok = await request(app)
      .patch('/api/conta')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nome: 'Paulo Carlos Baltazar', organizacao: 'UEM · Fitossanidade' });
    expect(ok.status).toBe(200);
    expect(ok.body.utilizador).toMatchObject({
      email: 'paulo.baltazar@uem.mz',
      nome: 'Paulo Carlos Baltazar',
      organizacao: 'UEM · Fitossanidade',
    });
  });

  test('T13 [Integração]: Alterar senha exige senha actual e aceita nova senha válida', async () => {
    const email = CONTA_ADMIN_SISTEMA.email;
    const actual = CONTA_ADMIN_SISTEMA.senha;
    const proxima = 'OutraSenha2!';

    const semSessao = await request(app).post('/api/conta/senha').send({
      email,
      senhaActual: actual,
      senhaNova: proxima,
    });
    expect(semSessao.status).toBe(401);

    const login = await request(app).post('/api/login').send({ email, senha: actual });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const fraca = await request(app)
      .post('/api/conta/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaActual: actual, senhaNova: 'fraca1' });
    expect(fraca.status).toBe(400);

    const falha = await request(app)
      .post('/api/conta/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaActual: 'errada1', senhaNova: proxima });
    expect(falha.status).toBe(401);

    const ok = await request(app)
      .post('/api/conta/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaActual: actual, senhaNova: proxima });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);

    const loginNova = await request(app).post('/api/login').send({ email, senha: proxima });
    expect(loginNova.status).toBe(200);

    const restaurar = await request(app)
      .post('/api/conta/senha')
      .set('Authorization', `Bearer ${loginNova.body.token}`)
      .send({ senhaActual: proxima, senhaNova: actual });
    expect(restaurar.status).toBe(200);
  });

  test('T04 [Fronteira]: Deve emitir erro para Latitude > 90', () => {
    const payload = {
      cultura: 'Milho',
      sintomas: ['manchas_amarelas'],
      latitude: 95.0,
      longitude: 32.5,
    };
    const erro = validarCamposOcorrencia(payload);
    expect(erro).toBe('Latitude fora dos limites (-90 a 90)');
  });

  test('T05 [Fronteira]: Deve aceitar Longitude no limite exato de -180', () => {
    const payload = {
      cultura: 'Milho',
      sintomas: ['folhas_secas'],
      latitude: -25.0,
      longitude: -180.0,
    };
    const erro = validarCamposOcorrencia(payload);
    expect(erro).toBeNull();
  });

  test('T06 [Regra]: Deve bloquear registro de ocorrência sem sintomas', async () => {
    const res = await request(app)
      .post('/api/ocorrencias')
      .set('x-user-role', 'AGRICULTOR')
      .send({ cultura: 'Mandioca', sintomas: [], latitude: -25.7, longitude: 32.6 });

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Deve informar ao menos 1 sintoma');
  });

  test('T07 [Regra]: Deve calcular 100% de confiança quando todos os sintomas coincidirem', () => {
    const sintomasInput = ['manchas_amarelas', 'folhas_secas'];
    const sintomasFicha = ['manchas_amarelas', 'folhas_secas'];

    const resultado = calcularTriagem(sintomasInput, sintomasFicha);
    expect(resultado.confianca).toBe(100);
    expect(resultado.status).toBe('TRIADA');
  });

  test('T08 [Regra]: Deve encaminhar para técnico se confiança for < 60%', () => {
    const sintomasInput = ['manchas_amarelas'];
    const sintomasFicha = ['manchas_amarelas', 'folhas_secas'];

    const resultado = calcularTriagem(sintomasInput, sintomasFicha);
    expect(resultado.confianca).toBe(50);
    expect(resultado.status).toBe('ENCAMINHADA');
  });

  test('T09 [RBAC]: Agricultor não deve conseguir validar ocorrência (403)', async () => {
    const res = await request(app).post('/api/validacoes').set('x-user-role', 'AGRICULTOR');

    expect(res.status).toBe(403);
    expect(res.body.erro).toContain('Requer perfil TECNICO');
  });

  test('T10 [Integração]: Técnico autorizado altera status da ocorrência para VALIDADA', async () => {
    const registo = await request(app)
      .post('/api/ocorrencias')
      .set('x-user-role', 'AGRICULTOR')
      .send({
        cultura: 'Milho',
        sintomas: ['manchas_amarelas'],
        latitude: -25.7,
        longitude: 32.6,
      });
    expect(registo.status).toBe(201);
    expect(registo.body.status).toBe('ENCAMINHADA');

    const semNota = await request(app)
      .post('/api/validacoes')
      .set('x-user-role', 'TECNICO')
      .send({ id: registo.body.ocorrencia.id });
    expect(semNota.status).toBe(400);

    const res = await request(app)
      .post('/api/validacoes')
      .set('x-user-role', 'TECNICO')
      .send({ id: registo.body.ocorrencia.id, nota: 'Confirmado em campo: mancha foliar típica.' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VALIDADA');
    expect(res.body.ocorrencia?.status).toBe('VALIDADA');
    expect(res.body.ocorrencia?.notaValidacao).toContain('Confirmado em campo');

    const historico = await request(app)
      .get(`/api/ocorrencias/${registo.body.ocorrencia.id}/historico`)
      .set('x-user-role', 'TECNICO');
    expect(historico.status).toBe(200);
    expect(historico.body.historico.length).toBeGreaterThanOrEqual(2);
    expect(historico.body.historico.at(-1)?.paraStatus).toBe('VALIDADA');
  });

  test('T14 [Integração]: Pedido de apoio — agricultor cria, técnico responde e isola por autor', async () => {
    const admin = await request(app)
      .post('/api/login')
      .send({ email: CONTA_ADMIN_SISTEMA.email, senha: CONTA_ADMIN_SISTEMA.senha });
    expect(admin.status).toBe(200);

    const criarAgr = await request(app)
      .post('/api/utilizadores')
      .set('Authorization', `Bearer ${admin.body.token}`)
      .send({
        email: 'agricultor.apoio@uem.mz',
        senha: 'FitoSmart1!',
        perfil: 'AGRICULTOR',
        nome: 'Agricultor Apoio',
      });
    expect(criarAgr.status).toBe(201);

    const criarTec = await request(app)
      .post('/api/utilizadores')
      .set('Authorization', `Bearer ${admin.body.token}`)
      .send({
        email: 'tecnico.apoio@uem.mz',
        senha: 'FitoSmart1!',
        perfil: 'TECNICO',
        nome: 'Técnico Apoio',
      });
    expect(criarTec.status).toBe(201);

    const agr = await request(app)
      .post('/api/login')
      .send({ email: 'agricultor.apoio@uem.mz', senha: 'FitoSmart1!' });
    expect(agr.status).toBe(200);

    const ocorrencia = await request(app)
      .post('/api/ocorrencias')
      .set('Authorization', `Bearer ${agr.body.token}`)
      .send({
        cultura: 'Milho',
        sintomas: ['manchas_amarelas'],
        latitude: -25.7,
        longitude: 32.6,
      });
    expect(ocorrencia.status).toBe(201);

    const semOcorrencia = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${agr.body.token}`)
      .send({
        assunto: 'Folhas amarelas no milho',
        mensagem: 'Apareceram manchas após a última chuva. Preciso de orientação.',
      });
    expect(semOcorrencia.status).toBe(400);

    const listaTecnicos = await request(app)
      .get('/api/tecnicos')
      .set('Authorization', `Bearer ${agr.body.token}`);
    expect(listaTecnicos.status).toBe(200);
    expect(listaTecnicos.body.tecnicos.some((t: { email: string }) => t.email === 'tecnico.apoio@uem.mz')).toBe(
      true,
    );

    const criado = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${agr.body.token}`)
      .send({
        assunto: 'Folhas amarelas no milho',
        mensagem: 'Apareceram manchas após a última chuva. Preciso de orientação.',
        ocorrenciaId: ocorrencia.body.ocorrencia.id,
        tecnicoEmail: 'tecnico.apoio@uem.mz',
      });
    expect(criado.status).toBe(201);
    expect(criado.body.pedido.ocorrenciaId).toBe(ocorrencia.body.ocorrencia.id);
    expect(criado.body.pedido.tecnicoEmail).toBe('tecnico.apoio@uem.mz');
    expect(criado.body.pedido.estado).toBe('ABERTO');
    expect(criado.body.pedido.mensagens).toHaveLength(1);

    const tec = await request(app)
      .post('/api/login')
      .send({ email: 'tecnico.apoio@uem.mz', senha: 'FitoSmart1!' });
    expect(tec.status).toBe(200);

    const resposta = await request(app)
      .post(`/api/pedidos/${criado.body.pedido.id}/mensagens`)
      .set('Authorization', `Bearer ${tec.body.token}`)
      .send({ mensagem: 'Pode enviar fotografia das folhas afectadas?' });
    expect(resposta.status).toBe(200);
    expect(resposta.body.pedido.estado).toBe('EM_ATENDIMENTO');
    expect(resposta.body.pedido.mensagens.length).toBe(2);

    const encerrar = await request(app)
      .patch(`/api/pedidos/${criado.body.pedido.id}`)
      .set('Authorization', `Bearer ${tec.body.token}`)
      .send({ estado: 'ENCERRADO' });
    expect(encerrar.status).toBe(200);
    expect(encerrar.body.pedido.estado).toBe('ENCERRADO');

    const outroAgr = await request(app)
      .post('/api/utilizadores')
      .set('Authorization', `Bearer ${admin.body.token}`)
      .send({
        email: 'outro.agricultor@uem.mz',
        senha: 'FitoSmart1!',
        perfil: 'AGRICULTOR',
        nome: 'Outro Agricultor',
      });
    expect(outroAgr.status).toBe(201);

    const loginOutro = await request(app)
      .post('/api/login')
      .send({ email: 'outro.agricultor@uem.mz', senha: 'FitoSmart1!' });
    expect(loginOutro.status).toBe(200);

    const listaOutro = await request(app)
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${loginOutro.body.token}`);
    expect(listaOutro.status).toBe(200);
    expect(listaOutro.body.pedidos).toHaveLength(0);

    const verAlheio = await request(app)
      .get(`/api/pedidos/${criado.body.pedido.id}`)
      .set('Authorization', `Bearer ${loginOutro.body.token}`);
    expect(verAlheio.status).toBe(404);

    const avaliar = await request(app)
      .post(`/api/pedidos/${criado.body.pedido.id}/avaliacao`)
      .set('Authorization', `Bearer ${agr.body.token}`)
      .send({ estrelas: 5, comentario: 'Orientação clara e útil.' });
    expect(avaliar.status).toBe(201);
    expect(avaliar.body.avaliacao.estrelas).toBe(5);

    const ranking = await request(app)
      .get('/api/ranking/tecnicos')
      .set('Authorization', `Bearer ${agr.body.token}`);
    expect(ranking.status).toBe(200);
    expect(ranking.body.ranking[0]).toMatchObject({
      email: 'tecnico.apoio@uem.mz',
      media: 5,
      total: 1,
    });
  });

  test('T15 [Campo]: Delta-T, Markov e SMS 2G para janela de pulverização', () => {
    const delta = calcularDeltaT(30, 45);
    expect(delta).toBeGreaterThan(2);
    expect(classificarEstadoHidrico(3, 0.1)).toBe('CHUVOSO');
    expect(classificarEstadoHidrico(0, 0.4)).toBe('SATURADO');
    expect(avaliarJanela('SECO', 5, 0, 5).janela).toBe('FAVORAVEL');
    expect(avaliarJanela('SECO', 12, 0, 5).janela).toBe('DESFAVORAVEL');

    const matriz = estimarMatrizTransicao(['SECO', 'SECO', 'HUMIDO', 'CHUVOSO', 'HUMIDO']);
    expect(matriz.SECO.SECO).toBeGreaterThan(0);
    expect(truncarSms('a'.repeat(200)).length).toBeLessThanOrEqual(160);

    const painelFake: PainelOperacional = {
      local: 'Maputo',
      geradoEm: new Date().toISOString(),
      fonte: 'teste',
      actual: {
        temperaturaC: 30,
        humidadePct: 45,
        pressaoHpa: 1008,
        deltaT: delta,
        ventoKmh: 8,
        soloM3: 0.12,
        janela: 'FAVORAVEL',
        motivo: 'ok',
      },
      memoriaAgricola: { estadosObservados: ['SECO'], matrizTransicao: matriz },
      janelas: [],
      mapaChuva: [{ lat: -25.966, lon: 32.583, precipMm: 0 }],
      smsExemplo: 'x',
    };
    const sms = responderSms('JANELA', painelFake);
    expect(sms).toMatch(/FitoSmart/);
    expect(sms.length).toBeLessThanOrEqual(160);
    expect(responderSms('AJUDA', painelFake)).toMatch(/JANELA/);
  });
});
