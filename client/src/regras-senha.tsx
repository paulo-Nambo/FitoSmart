import { avaliarSenhaNova } from './senha';

export function RegrasSenha({ senha, id }: { senha: string; id?: string }) {
  const regras = avaliarSenhaNova(senha);
  const activas = senha.length > 0;

  return (
    <ul id={id} className={activas ? 'regras-senha regras-senha-activas' : 'regras-senha'} aria-label="Requisitos da senha">
      {regras.map((regra) => (
        <li key={regra.id} className={regra.ok ? 'regras-senha-ok' : 'regras-senha-falha'} aria-checked={regra.ok} role="checkbox">
          <span aria-hidden="true">{regra.ok ? '✓' : '○'}</span>
          {regra.rotulo}
        </li>
      ))}
    </ul>
  );
}
