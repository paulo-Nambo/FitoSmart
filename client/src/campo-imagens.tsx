import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type Ref,
} from 'react';
import type { Diagnostico } from './api';
import {
  comprimirFotografia,
  detectarPraga,
  fotografiaExemplo,
  LIMITE_FOTOS,
  TAMANHO_MAX_FICHEIRO,
} from './detectar-praga';
export interface FotoPronta {
  blob: Blob;
}

export interface CampoImagensHandle {
  ler(): FotoPronta[];
  sujo(): boolean;
  limpar(): void;
}

interface FotoVista {
  id: string;
  preview: string;
  blob: Blob;
  sintomas: string[];
  resumo: string;
  diagnostico: Diagnostico | null;
}

interface CampoImagensProps {
  ref?: Ref<CampoImagensHandle>;
  token: string;
  cultura: string;
  aoDetectar: (sintomas: string[], diagnostico: Diagnostico | null) => void;
  aoErro: (mensagem: string) => void;
}

const ICONE_CAMARA = (
  <span className="fotos-icone" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
      <path
        d="M4.5 8.5A2.5 2.5 0 0 1 7 6h1.2l1.1-1.6A1.5 1.5 0 0 1 10.5 3.8h3a1.5 1.5 0 0 1 1.2.6L15.8 6H17a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  </span>
);

function unirSintomas(lista: FotoVista[]) {
  const unidos = new Set<string>();
  for (const foto of lista) {
    for (const id of foto.sintomas) unidos.add(id);
  }
  return [...unidos];
}

function melhorDiagnostico(lista: FotoVista[]): Diagnostico | null {
  let melhor: Diagnostico | null = null;
  for (const foto of lista) {
    if (!foto.diagnostico) continue;
    if (!melhor || foto.diagnostico.confianca > melhor.confianca) melhor = foto.diagnostico;
  }
  return melhor;
}

const FotoCartao = memo(function FotoCartao({
  foto,
  indice,
  aoRemover,
}: {
  foto: FotoVista;
  indice: number;
  aoRemover: (id: string) => void;
}) {
  return (
    <li className="foto">
      <img
        src={foto.preview}
        alt={`Fotografia ${indice + 1} da planta`}
        width={160}
        height={120}
        loading={indice === 0 ? 'eager' : 'lazy'}
        decoding="async"
      />
      <button
        type="button"
        className="foto-remover"
        onClick={() => aoRemover(foto.id)}
        aria-label={`Remover fotografia ${indice + 1}`}
      >
        Remover
      </button>
    </li>
  );
});

export const CampoImagens = memo(function CampoImagens({
  ref,
  token,
  cultura,
  aoDetectar,
  aoErro,
}: CampoImagensProps) {
  const [fotos, setFotos] = useState<FotoVista[]>([]);
  const [aAnalisar, setAAnalisar] = useState(false);
  const [aArrastar, setAArrastar] = useState(false);
  const fotosRef = useRef(fotos);
  const culturaRef = useRef(cultura);
  const tokenRef = useRef(token);
  const arrastoRef = useRef(0);
  const aoDetectarRef = useRef(aoDetectar);
  const aoErroRef = useRef(aoErro);
  fotosRef.current = fotos;
  culturaRef.current = cultura;
  tokenRef.current = token;
  aoDetectarRef.current = aoDetectar;
  aoErroRef.current = aoErro;

  useImperativeHandle(
    ref,
    () => ({
      ler: () => fotosRef.current.map((foto) => ({ blob: foto.blob })),
      sujo: () => fotosRef.current.length > 0,
      limpar: () => {
        for (const foto of fotosRef.current) URL.revokeObjectURL(foto.preview);
        setFotos([]);
      },
    }),
    [],
  );

  useEffect(() => {
    return () => {
      for (const foto of fotosRef.current) URL.revokeObjectURL(foto.preview);
    };
  }, []);

  const sincronizar = useCallback((lista: FotoVista[]) => {
    aoDetectarRef.current(unirSintomas(lista), melhorDiagnostico(lista));
  }, []);

  const acrescentar = useCallback(
    async (ficheiros: Blob[]) => {
      const vagas = LIMITE_FOTOS - fotosRef.current.length;
      if (vagas <= 0) {
        aoErroRef.current(`Pode enviar no máximo ${LIMITE_FOTOS} fotografias por ocorrência.`);
        return;
      }

      const validos: Blob[] = [];
      for (const ficheiro of ficheiros.slice(0, vagas)) {
        if (ficheiro.size > TAMANHO_MAX_FICHEIRO) {
          aoErroRef.current('Cada fotografia deve ter no máximo 12 MB.');
          continue;
        }
        validos.push(ficheiro);
      }
      if (validos.length === 0) return;

      setAAnalisar(true);
      try {
        const comprimidas = await Promise.all(validos.map((ficheiro) => comprimirFotografia(ficheiro)));
        const rascunhos: FotoVista[] = comprimidas.map((blob) => ({
          id: crypto.randomUUID(),
          preview: URL.createObjectURL(blob),
          blob,
          sintomas: [],
          resumo: 'A diagnosticar…',
          diagnostico: null,
        }));
        const comPreview = [...fotosRef.current, ...rascunhos];
        setFotos(comPreview);

        const analisadas = await Promise.all(
          rascunhos.map(async (foto) => {
            const deteccao = await detectarPraga(foto.blob, tokenRef.current, culturaRef.current);
            return {
              ...foto,
              sintomas: deteccao.sintomas,
              resumo: deteccao.resumo,
              diagnostico: deteccao.diagnostico,
            };
          }),
        );
        const porId = new Map(analisadas.map((foto) => [foto.id, foto]));
        const proxima = fotosRef.current.map((foto) => porId.get(foto.id) ?? foto);
        setFotos(proxima);
        sincronizar(proxima);
      } catch {
        aoErroRef.current('Não foi possível ler a fotografia. Use JPEG, PNG ou WebP.');
      } finally {
        setAAnalisar(false);
      }
    },
    [sincronizar],
  );

  function mudarFicheiros(evento: ChangeEvent<HTMLInputElement>) {
    const ficheiros = Array.from(evento.target.files ?? []);
    evento.target.value = '';
    if (ficheiros.length === 0) return;
    void acrescentar(ficheiros);
  }

  const remover = useCallback(
    (id: string) => {
      const alvo = fotosRef.current.find((foto) => foto.id === id);
      if (alvo) URL.revokeObjectURL(alvo.preview);
      const proxima = fotosRef.current.filter((foto) => foto.id !== id);
      setFotos(proxima);
      sincronizar(proxima);
    },
    [sincronizar],
  );

  function aoArrastarEntrar(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault();
    arrastoRef.current += 1;
    setAArrastar(true);
  }

  function aoArrastarSair(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault();
    arrastoRef.current = Math.max(0, arrastoRef.current - 1);
    if (arrastoRef.current === 0) setAArrastar(false);
  }

  function aoArrastarSobre(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'copy';
  }

  function aoLargar(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault();
    arrastoRef.current = 0;
    setAArrastar(false);
    if (aAnalisar || fotosRef.current.length >= LIMITE_FOTOS) return;
    const lista = [...evento.dataTransfer.files].filter((ficheiro) => ficheiro.type.startsWith('image/'));
    if (lista.length === 0) {
      aoErroRef.current('Largue apenas imagens JPEG, PNG ou WebP.');
      return;
    }
    void acrescentar(lista);
  }

  const cheio = fotos.length >= LIMITE_FOTOS;
  const restantes = LIMITE_FOTOS - fotos.length;
  const temFotos = fotos.length > 0;

  return (
    <fieldset className="fotos-campo" aria-busy={aAnalisar}>
      <legend>Fotografias da planta</legend>
      <input
        id="fotografias"
        className="entrada-ficheiro"
        name="fotografias"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        disabled={aAnalisar || cheio}
        onChange={mudarFicheiros}
      />
      {temFotos ? (
        <ul className="fotos">
          {fotos.map((foto, indice) => (
            <FotoCartao key={foto.id} foto={foto} indice={indice} aoRemover={remover} />
          ))}
        </ul>
      ) : null}
      {cheio ? null : temFotos ? (
        <div className="fotos-secundo">
          <label
            htmlFor="fotografias"
            className={aArrastar ? 'fotos-add fotos-add-activa' : 'fotos-add'}
            onDragEnter={aoArrastarEntrar}
            onDragLeave={aoArrastarSair}
            onDragOver={aoArrastarSobre}
            onDrop={aoLargar}
          >
            {aAnalisar ? `A diagnosticar… (${restantes} restantes)` : `Adicionar fotografia (${restantes} restantes)`}
          </label>
        </div>
      ) : (
        <>
          <label
            htmlFor="fotografias"
            className={aArrastar ? 'fotos-zona fotos-zona-activa' : 'fotos-zona'}
            onDragEnter={aoArrastarEntrar}
            onDragLeave={aoArrastarSair}
            onDragOver={aoArrastarSobre}
            onDrop={aoLargar}
          >
            {ICONE_CAMARA}
            <span className="fotos-zona-titulo">Arraste fotografias ou clique para carregar</span>
            <span className="fotos-zona-meta">Diagnóstico inteligente · até {LIMITE_FOTOS} · JPEG, PNG ou WebP</span>
          </label>
          <button
            type="button"
            className="ligacao fotos-exemplo"
            disabled={aAnalisar}
            aria-busy={aAnalisar}
            onClick={() => void fotografiaExemplo().then((blob) => acrescentar([blob]))}
          >
            Usar exemplo de manchas
          </button>
        </>
      )}
    </fieldset>
  );
});
