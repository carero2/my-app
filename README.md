# Vida

App personal por módulos: finanzas, hábitos y notas. Web app que se instala en la
pantalla de inicio del iPhone, funciona sin conexión y sincroniza con un Worker propio.

## Estructura

```
index.html                 armazón
manifest.webmanifest
sw.js                      caché sin conexión
css/estilo.css
js/app.js                  arranque y navegación
js/nucleo.js               datos, sincronización, avisos y hojas
js/hoy.js                  pestaña Hoy
js/finanzas.js             añadir, movimientos, métricas, importador CSV
js/habitos.js              hábitos por grupos, con tipos y periodicidad
js/notas.js                notas con título, categoría y texto
js/ajustes.js              nube, presupuesto, copias
icons/
```

Súbelo todo a la raíz del repo, respetando las carpetas `js`, `css` e `icons`.

## Formato del CSV para importar

Columnas, en este orden o con estas cabeceras:

```
fecha;importe;categoria;nota;tipo
06/09/2026;12,40;comida;Menú del día;gasto
2026-09-05;3,50;;MERCADONA;gasto
04/09/2026;1200;;Nómina;ingreso
```

- **fecha** obligatoria. Vale `dd/mm/aaaa` o `aaaa-mm-dd`.
- **importe** obligatorio. Coma o punto decimal. El signo se ignora.
- **categoria** opcional: comida, transporte, compras, ocio, hogar, salud, otros.
  Si va vacía, se adivina a partir de la nota.
- **nota** opcional.
- **tipo** opcional: `ingreso` o `gasto`. Por defecto gasto.

Separador punto y coma o coma. La cabecera es opcional.
Los movimientos con la misma fecha e importe que uno ya registrado se omiten,
así que puedes reimportar sin duplicar.

## Parámetros de URL

- `?add=1` abre directamente el teclado de gastos
- `?ver=habitos` abre un módulo concreto (hoy, finanzas, habitos, notas, ajustes)

## Hábitos

Cada hábito tiene **tipo** (sí/no, cantidad o cronómetro) y **periodicidad**
(cada día, cada semana o cada mes). Las rachas, la tira de progreso y el resumen
se calculan sobre esa periodicidad: un hábito mensual como "dos libros al mes"
cuenta meses, no días.

Los registros diarios conservan el formato de siempre (`2026-09-07`); los
semanales usan el lunes de esa semana (`s2026-09-07`) y los mensuales el mes
(`m2026-09`). Cambiar la periodicidad de un hábito no borra el historial
anterior, solo deja de contarlo mientras esté en la nueva.
