/** Papéis alinhados ao farmOS (Worker / Manager / Viewer / Account Admin / Config Admin). */
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

export function ePerfil(valor: unknown): valor is Perfil {
  return typeof valor === 'string' && (PERFIS as readonly string[]).includes(valor);
}

/** Worker: regista ocorrências no campo. */
export function podeRegistarOcorrencia(perfil: Perfil): boolean {
  return perfil === 'AGRICULTOR' || perfil === 'TECNICO' || perfil === 'GESTOR';
}

/** Vê todas as ocorrências (não só as próprias). */
export function podeVerTodasOcorrencias(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR' || perfil === 'VISUALIZADOR' || perfil === 'ADMIN_SISTEMA';
}

/** Valida casos ENCAMINHADA (técnico de campo + gestor). */
export function podeValidar(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR';
}

/** Account Admin + Administrador do sistema. */
export function podeGerirContas(perfil: Perfil): boolean {
  return perfil === 'ADMIN_CONTAS' || perfil === 'ADMIN_SISTEMA';
}

/** Config Admin + Administrador do sistema. */
export function podeConfigurar(perfil: Perfil): boolean {
  return perfil === 'ADMIN_CONFIG' || perfil === 'ADMIN_SISTEMA';
}

export function podeVerImagemOcorrencia(perfil: Perfil): boolean {
  return podeVerTodasOcorrencias(perfil) || perfil === 'AGRICULTOR';
}

/** Agricultor abre pedidos de apoio ao técnico. */
export function podeCriarPedidoApoio(perfil: Perfil): boolean {
  return perfil === 'AGRICULTOR';
}

/** Técnico, gestor e administrador do sistema atendem e encerram pedidos de apoio. */
export function podeAtenderPedidoApoio(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR' || perfil === 'ADMIN_SISTEMA';
}

/** Vê todos os pedidos (não só os próprios). */
export function podeVerTodosPedidosApoio(perfil: Perfil): boolean {
  return perfil === 'TECNICO' || perfil === 'GESTOR' || perfil === 'ADMIN_SISTEMA';
}

/** Acede ao ecrã de pedidos de apoio. */
export function podeUsarPedidosApoio(perfil: Perfil): boolean {
  return podeCriarPedidoApoio(perfil) || podeAtenderPedidoApoio(perfil) || perfil === 'ADMIN_SISTEMA';
}
