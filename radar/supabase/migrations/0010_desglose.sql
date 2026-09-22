-- En qué se fue, no solo cuánto.
--
-- `cost_usd` ya guardaba el total de cada pasada, y un total no deja tomar
-- ninguna decisión: si un mes sale caro, la pregunta es si fue el filtro
-- —mucho correo entrando— o la lectura —mucho correo que merecía abrirse—,
-- porque se arreglan de formas distintas.
--
-- Va como jsonb y no como dos columnas porque las etapas van a cambiar: el
-- día que el cruce del día vuelva, se apunta solo.
alter table sync_runs
  add column if not exists desglose jsonb;

grant all on sync_runs to service_role;
