/** Espelho dos papéis do servidor (farmOS). */
export const PERFIS = [
  'AGRICULTOR',
  'TECNICO',
  'GESTOR',
  'VISUALIZADOR',
  'ADMIN_CONTAS',
  'ADMIN_CONFIG',
  'ADMIN_SISTEMA',
] as const;

export type Perfil = (typeof PERFIS)[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  AGRICULTOR: 'Agricultor',
  TECNICO: 'Técnico',
  GESTOR: 'Gestor',
  VISUALIZADOR: 'Visualizador',
  ADMIN_CONTAS: 'Admin de contas',
  ADMIN_CONFIG: 'Admin de configuração',
  ADMIN_SISTEMA: 'Administrador do sistema',
};

export const INICIAIS_PERFIL: Record<Perfil, string> = {
  AGRICULTOR: 'AG',
  TECNICO: 'TE',
  GESTOR: 'GE',
  VISUALIZADOR: 'VI',
  ADMIN_CONTAS: 'AC',
  ADMIN_CONFIG: 'CF',
  ADMIN_SISTEMA: 'AS',
};

export function ePerfil(valor: unknown): valor is Perfil {
  return typeof valor === 'string' && (PERFIS as readonly string[]).includes(valor);
}

export function podeRegistarOcorrencia(perfil: Perfil): boolean {
  return perfil === 'AGRICULTOR' || perfil === 'TECNICO' || perfil === 'GESTOR';
}

export function podeVerTodasOcorrencias(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR' || perfil === 'VISUALIZADOR' || perfil === 'ADMIN_SISTEMA';
}

export function podeValidar(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR';
}

export function podeGerirContas(perfil: Perfil): boolean {
  return perfil === 'ADMIN_CONTAS' || perfil === 'ADMIN_SISTEMA';
}

export function podeConfigurar(perfil: Perfil): boolean {
  return perfil === 'ADMIN_CONFIG' || perfil === 'ADMIN_SISTEMA';
}

export function podeCriarPedidoApoio(perfil: Perfil): boolean {
  return perfil === 'AGRICULTOR';
}

export function podeAtenderPedidoApoio(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR' || perfil === 'ADMIN_SISTEMA';
}

export function podeVerTodosPedidosApoio(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR' || perfil === 'ADMIN_SISTEMA';
}

export function podeUsarPedidosApoio(perfil: Perfil): boolean {
  return podeCriarPedidoApoio(perfil) || podeAtenderPedidoApoio(perfil) || perfil === 'ADMIN_SISTEMA';
}
