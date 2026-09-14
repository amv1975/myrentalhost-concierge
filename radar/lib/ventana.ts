/**
 * Cuánto hacia atrás mira Radar.
 *
 * Vive en un solo sitio porque son dos ventanas que tienen que coincidir y que
 * ya se desincronizaron una vez: la de la ingesta —hasta dónde se baja del
 * buzón— y la del parte —hasta dónde se enseña—. Si la primera es más corta,
 * hay correos que nunca se descargan; si lo es la segunda, se descargan, se
 * pagan y no se ven nunca.
 *
 * Siete días y no dos. Dos parecían "el fin de semana" y no lo eran: abriendo
 * el lunes a las nueve, cuarenta y ocho horas llegan al sábado a las nueve, así
 * que el viernes entero —y con él la reunión de vecinos y los billetes de
 * Madrid— se quedaba fuera sin que nada lo dijera. Una aplicación que se mira
 * cuando uno puede no puede medir en horas desde ahora.
 *
 * Que no crezca sin control no lo decide esta ventana, lo decide despachar: el
 * parte esconde lo que ya marcaste, así que lo que se acumula es exactamente
 * lo que no has mirado. Ese montón sí debe crecer hasta que lo mires.
 */
export const DIAS_VENTANA = 7;

export const VENTANA_MS = DIAS_VENTANA * 86_400_000;
