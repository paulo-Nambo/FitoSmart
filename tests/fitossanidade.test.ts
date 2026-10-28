import request from 'supertest';
import jwt from 'jsonwebtoken';
import { emailValido, senhaValida } from '../src/auth';
import { criarApp } from '../src/app';
import {
  calcularTriagem,
  reporEstado,
  validarCamposOcorrencia,
} from '../src/fitossanidade';

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
      .send({ email: 'agricultor@uem.mz', senha: '123456' });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET as string);
    expect(payload).toMatchObject({
      email: 'agricultor@uem.mz',
      perfil: 'AGRICULTOR',
    });
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
    const res = await request(app).post('/api/validacoes').set('x-user-role', 'TECNICO');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('VALIDADA');
  });
});
