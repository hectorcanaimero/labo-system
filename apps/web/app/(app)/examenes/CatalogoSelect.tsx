'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toHumanError } from '@labo/lib/error-messages';
import { notifyError, notifySuccess } from '@labo/ui/feedback/toast';
import { apiFetch } from '@/lib/api-client';

/**
 * Selector alimentado por un catálogo de mantenimiento (tipos de análisis,
 * métodos). Reemplaza al texto libre y al enum fijo del código.
 *
 * Dos cosas que hace y son el punto del componente:
 *   - Si el valor guardado ya no está en la lista (lo desactivaron o lo
 *     renombraron), lo agrega como opción marcada en vez de descartarlo. Sin
 *     eso, abrir y guardar un examen viejo le borraba el valor en silencio.
 *   - El admin da de alta contra el catálogo sin salir del formulario.
 */

const OPCION_NUEVO = '__nuevo__';

export interface ItemCatalogo {
  id: string;
  nombre: string;
}

export interface CatalogoSelectProps {
  id: string;
  label: string;
  /** Endpoint del catálogo, p. ej. `/api/examenes/metodos`. */
  endpoint: string;
  value: string;
  onChange: (nombre: string) => void;
  disabled?: boolean;
  requerido?: boolean;
  /** Texto de la opción vacía. */
  placeholder: string;
  /** Etiqueta de la opción de alta, p. ej. "Agregar método…". */
  labelAgregar: string;
  placeholderNuevo: string;
  /** Puede dar de alta (admin). */
  puedeAgregar: boolean;
  /** Se dispara con el error si el alta falla, para mostrarlo donde el caller quiera. */
  onError?: (mensaje: string) => void;
  /** Recarga cuando cambia: se usa para refrescar al abrir el diálogo. */
  recargarToken?: unknown;
}

export function CatalogoSelect({
  id,
  label,
  endpoint,
  value,
  onChange,
  disabled,
  requerido,
  placeholder,
  labelAgregar,
  placeholderNuevo,
  puedeAgregar,
  onError,
  recargarToken,
}: CatalogoSelectProps) {
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setAltaAbierta(false);
    setNuevo('');

    void (async () => {
      try {
        const response = await apiFetch(endpoint, { headers: { accept: 'application/json' } });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? `REQUEST_FAILED_${response.status}`);
        }
        const payload = (await response.json()) as ItemCatalogo[];
        if (!cancelado) {
          setItems(payload);
          setErrorCarga(null);
        }
      } catch (error) {
        if (!cancelado) {
          setItems([]);
          setErrorCarga(toHumanError(error));
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [endpoint, recargarToken]);

  async function crear(): Promise<void> {
    const nombre = nuevo.trim();
    if (nombre.length === 0) return;

    try {
      setCreando(true);
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ nombre }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `REQUEST_FAILED_${response.status}`);
      }

      const creado = (await response.json()) as ItemCatalogo;
      setItems((actuales) =>
        actuales.some((item) => item.id === creado.id) ? actuales : [...actuales, creado],
      );
      onChange(creado.nombre);
      setAltaAbierta(false);
      setNuevo('');
      notifySuccess(`${label} agregado.`);
    } catch (error) {
      onError?.(toHumanError(error));
      notifyError(error);
    } finally {
      setCreando(false);
    }
  }

  const fueraDeLista = value.length > 0 && !items.some((item) => item.nombre === value);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {requerido ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const elegido = event.target.value;
          if (elegido === OPCION_NUEVO) {
            setAltaAbierta(true);
            return;
          }
          onChange(elegido);
        }}
        disabled={disabled}
        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.id} value={item.nombre}>
            {item.nombre}
          </option>
        ))}
        {fueraDeLista ? <option value={value}>{value} (fuera de la lista)</option> : null}
        {puedeAgregar ? <option value={OPCION_NUEVO}>{labelAgregar}</option> : null}
      </select>

      {altaAbierta ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={nuevo}
            onChange={(event) => setNuevo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void crear();
              }
              if (event.key === 'Escape') setAltaAbierta(false);
            }}
            disabled={creando || disabled}
            autoFocus
            placeholder={placeholderNuevo}
            aria-label={placeholderNuevo}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void crear()}
              disabled={creando || disabled || nuevo.trim().length === 0}
            >
              {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Agregar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAltaAbierta(false);
                setNuevo('');
              }}
              disabled={creando}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {errorCarga ? (
        <p className="text-xs text-destructive">No pudimos cargar la lista. {errorCarga}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {puedeAgregar
            ? 'La lista se administra en Catálogo → Tipos y métodos.'
            : 'Si falta un valor, pedile a un administrador que lo agregue.'}
        </p>
      )}
    </div>
  );
}
