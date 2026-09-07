# My-app
App personal por módulos: finanzas y hábitos. Web app que se instala en la pantalla
de inicio del iPhone, funciona sin conexión y sincroniza con un Worker propio.

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
js/habitos.js              hábitos por grupos, con tres tipos
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
- `?ver=habitos` abre un módulo concreto (hoy, finanzas, habitos, ajustes)
