import { useDatos } from "../datos";
import { db } from "../db";
import { useNav } from "../nav";
import { descartar } from "../lib/acciones";
import { copiaDeSeguridad } from "../lib/archivos";
import { fechaCorta, mesCorto, nombreMes } from "../lib/fecha";
import { num } from "../lib/formato";
import { pendientes, useExtras } from "../lib/revisar";
import { EtiquetaClase, Punto } from "../ui/piezas";
import { T } from "../ui/Icono";

/* "Para revisar": lo que la app te propone. Nada se aplica sin que lo confirmes. */
export function Revisar() {
  const d = useDatos();
  const nav = useNav();
  const extras = useExtras();
  if (!d.listo || !extras) return <div className="pantalla sin-tabs" />;
  const ultimoRespaldo = extras.ultimoRespaldo;
  const p = pendientes(d, extras);
  const cat = new Map(d.categorias.map(c => [c.id, c]));

  return (
    <div className="pantalla sin-tabs">
      <div className="enc"><button className="accion" aria-label="Volver" onClick={nav.volver}><T.IconArrowLeft size={22} /></button><h1>Para revisar</h1></div>
      {p.total === 0 && <div className="vacio"><T.IconCheck size={32} /><div>Nada para revisar.</div><div className="chico">Cuando tengas unos meses cargados, acá te voy a proponer qué es fijo, qué se repite y qué objetivos ponerte.</div></div>}

      {p.tareas.length > 0 && <div className="titulo-sec"><span>Pendientes</span><span>{p.tareas.length}</span></div>}
      {p.tareas.map(t => (
        <div key={t.clave} className="caja aviso">
          <div className="ambar">{t.titulo}</div>
          <div className="mini tenue">{t.detalle}</div>
          <div className="botones">
            {t.tipo === "diario" && <button className="btn1" onClick={() => nav.abrir({ p: "editor" })}>Cargar un gasto</button>}
            {t.tipo === "resumen" && <button className="btn1" onClick={() => nav.abrir({ p: "subir-resumen", cuentaId: t.cuenta.id })}>Subir el resumen</button>}
            {t.tipo === "exportar" && <button className="btn1" onClick={() => nav.abrir({ p: "exportar" })}>Exportar</button>}
            <button className="btn2" onClick={() => descartar(t.clave)}>{t.tipo === "diario" ? "Hoy no gasté" : "Ya lo hice"}</button>
          </div>
        </div>
      ))}

      {p.vinculos.length > 0 && <div className="titulo-sec"><span>¿Es el pago de un recurrente?</span><span>{p.vinculos.length}</span></div>}
      {p.vinculos.map(({ inst, mov }) => (
        <div key={mov.id + inst.rec.id} className="caja sug">
          <div className="fila" style={{ padding: 0 }}>
            <span className="izq"><Punto cat={cat.get(mov.categoriaId)} chico /><span>
              <div>{cat.get(mov.categoriaId)?.nombre}{mov.comentario ? ` · ${mov.comentario}` : ""}</div>
              <div className="mini tenue">{fechaCorta(mov.fecha, false)} · {num(mov.monto)} {mov.moneda}</div>
            </span></span>
          </div>
          <div className="mini tenue" style={{ margin: "4px 0 0 38px" }}>¿Es el pago de <span className="viol">{inst.rec.nombre}</span> de {inst.clave.length === 7 ? nombreMes(inst.clave, false) : fechaCorta(inst.fecha, false)}? (esperado ~{num(inst.esperado)} {inst.rec.moneda})</div>
          <div className="botones">
            <button className="btn1" onClick={() => db.movimientos.update(mov.id, { recurrenteId: inst.rec.id, periodo: inst.clave, modificado: new Date().toISOString() })}>Sí, vincular</button>
            <button className="btn2" onClick={() => descartar(`vinc|${mov.id}|${inst.rec.id}`)}>No</button>
          </div>
        </div>
      ))}

      {p.cierres.length > 0 && <div className="titulo-sec"><span>Cierres de tarjeta</span></div>}
      {p.cierres.map(c => (
        <div key={c.cuenta.id + c.periodo} className="caja aviso">
          <div className="ambar chico" style={{ marginBottom: 6 }}>¿Qué día cerró la {c.cuenta.nombre} en {nombreMes(c.periodo, false)}?</div>
          <div className="pills">
            {Array.from({ length: (c.cuenta.cierreHasta ?? 10) - (c.cuenta.cierreDesde ?? 5) + 1 }, (_, i) => (c.cuenta.cierreDesde ?? 5) + i).map(n => (
              <button key={n} className="pill" onClick={() => db.cuentas.update(c.cuenta.id, { cierres: { ...(c.cuenta.cierres ?? {}), [c.periodo]: n } })}>{n}</button>
            ))}
          </div>
          <div className="mini tenue">{c.compras === 1 ? "Hay 1 compra" : `Hay ${c.compras} compras`} en esos días que pueden ir a uno u otro resumen.</div>
        </div>
      ))}

      {p.clases.length > 0 && <div className="titulo-sec"><span>¿Fijo o variable?</span><span>{p.clases.length}</span></div>}
      {p.clases.map(s => (
        <div key={s.cat.id} className="caja sug">
          <div className="fila" style={{ padding: 0 }}>
            <span className="izq"><Punto cat={s.cat} chico /><span>{s.cat.nombre}</span></span>
            <EtiquetaClase clase={s.clase} />
          </div>
          <div className="mini tenue" style={{ margin: "4px 0 0 38px" }}>{s.porque}</div>
          <div className="botones">
            <button className="btn1" onClick={() => db.categorias.update(s.cat.id, { clase: s.clase, claseConfirmada: true })}>Confirmar</button>
            <button className="btn2" onClick={() => db.categorias.update(s.cat.id, { clase: s.clase === "fijo" ? "variable" : "fijo", claseConfirmada: true })}>Es {s.clase === "fijo" ? "variable" : "fijo"}</button>
          </div>
        </div>
      ))}

      {p.recurrentes.length > 0 && <div className="titulo-sec"><span>¿Esto se repite?</span><span>{p.recurrentes.length}</span></div>}
      {p.recurrentes.map(s => (
        <div key={s.clave} className="caja sug">
          <div className="fila" style={{ padding: 0 }}>
            <span className="izq"><Punto cat={cat.get(s.categoriaId)} chico /><span>{s.nombre}</span></span>
            <span className="num">{s.clase === "variable" ? "~" : ""}{num(s.monto)} {s.moneda}</span>
          </div>
          <div className="mini tenue" style={{ margin: "4px 0 0 38px" }}>
            Lo cargaste en {s.meses.map(mesCorto).join(", ")}{s.clase === "variable" ? ", con montos distintos" : ", mismo monto"} · alrededor del {s.dia}
          </div>
          <div className="botones">
            <button className="btn1" onClick={() => nav.abrir({ p: "recurrente", desdeSugerencia: s.clave })}>Es recurrente</button>
            <button className="btn2" onClick={() => descartar(`rec|${s.clave}`)}>No</button>
          </div>
        </div>
      ))}

      {p.objetivos.length > 0 && <div className="titulo-sec"><span>Objetivos sugeridos</span><span>{p.objetivos.length}</span></div>}
      {p.objetivos.map(s => (
        <div key={s.cat.id} className="caja sug">
          <div className="fila" style={{ padding: 0 }}>
            <span className="izq"><Punto cat={s.cat} chico /><span>{s.cat.nombre}</span></span>
            <span className="num">{num(s.objetivo)} USD/mes</span>
          </div>
          <div className="mini tenue" style={{ margin: "4px 0 0 38px" }}>Tu promedio de los últimos meses es {num(s.promedio)}: te propongo un 10% menos.</div>
          <div className="botones">
            <button className="btn1" onClick={() => db.categorias.update(s.cat.id, { objetivo: s.objetivo })}>Usar {num(s.objetivo)}</button>
            <button className="btn2" onClick={() => nav.abrir({ p: "categoria", id: s.cat.id })}>Otro monto</button>
            <button className="btn2" onClick={() => descartar(`obj|${s.cat.id}`)}>Sin objetivo</button>
          </div>
        </div>
      ))}

      {p.precios.length > 0 && <div className="titulo-sec"><span>Cambios de precio</span></div>}
      {p.precios.map(s => (
        <div key={s.clave} className="caja aviso">
          <div className={s.ahora > s.antes ? "ambar" : "ok"}>{s.rec.nombre} {s.ahora > s.antes ? "subió" : "bajó"} de {num(s.antes)} a {num(s.ahora)} {s.rec.moneda}</div>
          <div className="botones">
            <button className="btn1" onClick={async () => { await db.recurrentes.update(s.rec.id, { monto: s.ahora }); await descartar(s.clave); }}>Actualizar el monto</button>
            <button className="btn2" onClick={() => descartar(s.clave)}>Fue una vez</button>
          </div>
        </div>
      ))}

      {p.respaldo && (
        <>
          <div className="titulo-sec"><span>Copia de seguridad</span></div>
          <div className="caja aviso">
            <div className="ambar chico">{ultimoRespaldo ? "Hace más de una semana que no hacés una copia." : "Todavía no hiciste ninguna copia."}</div>
            <div className="mini tenue">Tus datos viven solo en este celular. Guardá el archivo en Drive o mandátelo por mail.</div>
            <div className="botones"><button className="btn1" onClick={copiaDeSeguridad}>Hacer copia ahora</button></div>
          </div>
        </>
      )}
    </div>
  );
}
