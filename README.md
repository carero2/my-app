# My-app

App personal de seguimiento diario: **finanzas**, **hábitos** y **notas**.

Es una aplicación web progresiva (PWA) que se instala en la pantalla de inicio del iPhone,
funciona sin conexión y sincroniza los datos entre dispositivos a través de un Cloudflare
Worker propio. No hay App Store, no hay cuenta de desarrollador, no hay servicio de terceros
con tus datos y no hay coste: tanto GitHub Pages como el plan gratuito de Cloudflare cubren
de sobra este uso.

---

## Índice

- [Características](#características)
- [Cómo funciona](#cómo-funciona)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
  - [1. Publicar la app en GitHub Pages](#1-publicar-la-app-en-github-pages)
  - [2. Instalarla en el iPhone](#2-instalarla-en-el-iphone)
  - [3. Desplegar el Worker (opcional)](#3-desplegar-el-worker-opcional)
  - [4. Conectar la app con el Worker](#4-conectar-la-app-con-el-worker)
- [Uso](#uso)
- [Integración con Atajos de iOS](#integración-con-atajos-de-ios)
- [Importar movimientos desde CSV](#importar-movimientos-desde-csv)
- [Modelo de datos](#modelo-de-datos)
- [API del Worker](#api-del-worker)
- [Sincronización y modo sin conexión](#sincronización-y-modo-sin-conexión)
- [Copias de seguridad](#copias-de-seguridad)
- [Desarrollo](#desarrollo)
- [Resolución de problemas](#resolución-de-problemas)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Ideas pendientes](#ideas-pendientes)

---

## Características

**Finanzas**
- Teclado numérico propio para registrar un gasto en dos segundos
- Ocho categorías con código de color tomado de los billetes de euro
- Ingresos además de gastos, con balance y tasa de ahorro
- Presupuesto mensual opcional con barra de progreso
- Fecha y hora manuales, para efectivo o recibos atrasados
- Listado por meses con filtro por categoría y edición al tocar
- Métricas: variación frente al mes anterior, media diaria, día más caro,
  proyección a fin de mes, desglose por categoría y evolución de seis meses
- Importación desde CSV con detección de duplicados y autocategorización
- Exportación a CSV

**Hábitos**
- Grupos definidos por el usuario que funcionan como submódulos (trabajo, sueño…),
  cada uno con su propio color
- Tres tipos: sí/no, cantidad con objetivo, y cronómetro tipo pomodoro
- Tres periodicidades: cada día, cada semana o cada mes
- Días activos: un hábito diario puede contar solo de lunes a viernes, por ejemplo
- Hábitos de solo seguimiento, que se registran pero no cuentan en el progreso del día
- Registro retroactivo: tocar cualquier celda de la tira corrige ese periodo
- Rachas, tira de progreso y resumen calculados sobre la periodicidad de cada hábito
- Resumen por semana natural, mes o año, con porcentaje sobre lo que tocaba
  y totales acumulados
- Archivar en vez de borrar, conservando el historial

**Notas**
- Título, categoría y texto libre
- Las categorías funcionan como submódulos, cada una con su color

**Generales**
- Funciona sin conexión, incluida la escritura
- Sincronización entre dispositivos con cola de pendientes
- Modo oscuro automático según el sistema
- Deshacer al borrar cualquier cosa
- Copia de seguridad y restauración en JSON

---

## Cómo funciona

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  GitHub Pages   │         │     iPhone       │         │   Cloudflare    │
│                 │  HTML   │                  │  HTTPS  │                 │
│  código de la   ├────────►│  My-app          │◄───────►│  Worker + KV    │
│  app (público)  │  CSS/JS │  localStorage    │  JSON   │  tus datos      │
│                 │         │  service worker  │         │  (privado)      │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                     ▲
                                     │  POST directo
                              ┌──────┴───────┐
                              │  Atajos iOS  │
                              └──────────────┘
```

El **código** vive en GitHub Pages y es público. Los **datos** nunca pasan por ahí: viven en
el KV de tu Worker y en el `localStorage` del dispositivo, que actúa como caché para poder
trabajar sin cobertura.

La app es **local primero**: cualquier cosa que escribas se guarda al instante en el
dispositivo y se marca como pendiente. La subida ocurre después, cuando haya red. Nunca
esperas a que responda el servidor.

Sin Worker configurado, la app funciona igual pero los datos existen solo en ese dispositivo.

---

## Estructura del proyecto

```
my-app/
├── index.html                armazón: contenedores de vistas y barra de pestañas
├── manifest.webmanifest      nombre, iconos y modo standalone
├── sw.js                     service worker: caché para funcionar sin conexión
├── css/
│   └── estilo.css            todos los estilos, con variables de tema
├── js/
│   ├── app.js                arranque, navegación entre módulos, parámetros de URL
│   ├── nucleo.js             datos, persistencia, sincronización, avisos y hojas modales
│   ├── hoy.js                pestaña Hoy
│   ├── finanzas.js           añadir, movimientos, métricas e importador CSV
│   ├── habitos.js            hábitos, periodos, rachas y resumen
│   ├── notas.js              notas por categoría
│   └── ajustes.js            nube, presupuesto, copias y zona de riesgo
└── icons/
    ├── apple-touch-icon.png  180×180, el que usa iOS
    ├── icon-192.png
    └── icon-512.png
```

El Worker vive en un repositorio aparte:

```
gastos-api/
├── wrangler.toml
└── src/worker.js
```

**Ningún módulo habla con `localStorage` directamente.** Todo pasa por `nucleo.js`, que se
encarga de persistir, marcar pendientes y avisar a la interfaz de que hay que repintar.
Añadir un módulo nuevo consiste en crear un archivo con una función `pintar(vista)`,
registrarlo en `MODULOS` dentro de `app.js` y añadir su sección y su botón en `index.html`.

---

## Requisitos

**Para usar la app:** un iPhone con iOS 16.4 o superior y Safari. Funciona igual en Android
y en escritorio, pero la instalación en pantalla de inicio está pensada para iOS.

**Para publicarla:** una cuenta de GitHub. El repositorio debe ser público, porque GitHub
Pages no funciona con repositorios privados en el plan gratuito.

**Para la sincronización:** una cuenta de Cloudflare (gratuita, sin tarjeta) y Node.js 18 o
superior para ejecutar Wrangler.

---

## Instalación

### 1. Publicar la app en GitHub Pages

Sube el contenido de esta carpeta a la raíz del repositorio, **respetando las carpetas
`js/`, `css/` e `icons/`**. Si los archivos JavaScript no quedan dentro de `js/`, los
módulos no se cargan y verás una pantalla en blanco.

```bash
git init
git add .
git commit -m "primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/my-app.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta
`/ (root)`, y **Save**. En uno o dos minutos tendrás la URL:

```
https://TU-USUARIO.github.io/my-app/
```

HTTPS es obligatorio para que funcionen los módulos de JavaScript y el service worker.
GitHub Pages ya lo proporciona.

### 2. Instalarla en el iPhone

1. Abre la URL **en Safari** (Chrome en iOS no puede instalar aplicaciones web).
2. Botón de compartir → **Añadir a pantalla de inicio**.
3. Ábrela siempre desde ese icono.

> **Importante:** Safari y el icono de la pantalla de inicio tienen almacenamientos
> separados. Los datos que escribas en uno no aparecen en el otro. Con el Worker
> configurado en ambos deja de importar, porque los dos leen de la misma fuente.

### 3. Desplegar el Worker (opcional)

Sin este paso la app funciona, pero los datos existen solo en ese dispositivo.

```bash
mkdir -p gastos-api/src && cd gastos-api
# copia aquí wrangler.toml y src/worker.js
npm install --save-dev wrangler
npx wrangler login
npx wrangler kv namespace create GASTOS
```

Pega el `id` que devuelve el último comando en `wrangler.toml`, sustituyendo
`PEGA_AQUI_EL_ID`. Después genera una clave larga y aleatoria:

```bash
# macOS o Linux
openssl rand -base64 32

# Windows PowerShell
$b = New-Object byte[] 32
(New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
$k = [Convert]::ToBase64String($b); $k | Set-Clipboard; "Copiada"
```

Guárdala en un gestor de contraseñas o en una nota bloqueada, y regístrala como secreto:

```bash
npx wrangler secret put CLAVE     # pega el valor cuando lo pida
npx wrangler deploy
```

El despliegue imprime la URL del Worker. Compruébalo:

```bash
curl https://TU-WORKER.workers.dev/salud
# {"ok":true}
```

`/salud` es la única ruta que no pide clave, precisamente para poder distinguir
"el Worker no responde" de "la clave es incorrecta".

### 4. Conectar la app con el Worker

En la app, pestaña **Ajustes → Sincronización**: pega la dirección del Worker y la clave, y
pulsa *Guardar y comprobar*. Si conecta, sube todo lo que ya tuvieras en ese dispositivo.

Repite lo mismo en cada sitio desde el que uses la app (Safari, el icono de la pantalla de
inicio, el ordenador). Cada uno guarda la configuración por separado.

---

## Uso

| Pestaña | Para qué sirve |
|---|---|
| **Hoy** | Pantalla de inicio: gasto del día y del mes, y los hábitos listos para marcar |
| **Finanzas** | Añadir movimiento, listado por meses y métricas |
| **Hábitos** | Los grupos que definas, más un resumen con métricas |
| **Notas** | Notas por categoría |
| **Ajustes** | Nube, presupuesto, importación, copias y borrado |

**Añadir un gasto:** teclado numérico, categoría y guardar. El botón `↓ Gasto` lo cambia a
`↑ Ingreso`. El botón de fecha permite registrar algo de otro día.

**Editar o borrar un movimiento:** en *Movimientos*, tócalo para editarlo o pulsa la ✕ para
borrarlo. Sale un aviso con **Deshacer** durante seis segundos.

**Crear un hábito:** en *Hábitos*, botón `+ Hábito`. El campo **Grupo** se convierte en una
pestaña dentro del módulo. Elige periodicidad y tipo:

| Tipo | Cómo se registra | Ejemplo |
|---|---|---|
| Sí o no | Una casilla que marcas | Meditar, no fumar |
| Cantidad | Botones − y + hacia un objetivo | 20 páginas al día, 2 libros al mes |
| Cronómetro | Play y stop, acumula minutos | 25 min de trabajo concentrado |

En los de cantidad, tocar el número abre un campo para escribir el valor exacto. En los de
cronómetro, el objetivo en minutos actúa como pomodoro: al llegar, vibra y avisa.

**Días activos.** Un hábito diario puede limitarse a ciertos días de la semana. Los días que
no marques se saltan: no rompen la racha, no cuentan en el progreso y aparecen apagados en
la tira. Un hábito de trabajo de lunes a viernes no se penaliza los sábados.

**Solo seguimiento.** Marcando esa opción, el hábito se registra con normalidad pero queda
fuera del círculo de progreso del día. Sirve para lo que quieres medir sin convertirlo en un
objetivo, o para lo que preferirías reducir en lugar de aumentar.

**Registro retroactivo.** Si se te olvidó anotar algo, toca cualquier celda de la tira de
progreso de ese hábito y se abre el registro de ese periodo. Dentro puedes además cambiar la
fecha con el selector, así que llegas a cualquier día pasado, no solo a los siete visibles.

**El círculo de progreso** solo cuenta los hábitos diarios que tocan hoy y que no estén
marcados como solo seguimiento. Los semanales y mensuales quedan fuera: si contaran, el
círculo diría que vas al 50% un día 3 del mes por un objetivo que tienes hasta el día 30.
La pestaña Hoy, por el mismo motivo, muestra solo los hábitos del día.

**El resumen** se calcula sobre tres ventanas naturales: la semana en curso de lunes a
domingo, el mes del día 1 al último, y el año completo. El porcentaje es cumplidos entre
*lo que tocaba hasta hoy*, no entre el rango entero: un miércoles con dos entrenamientos
de tres días transcurridos marca 67%, no 29%. Los periodos aún no transcurridos no
penalizan, y tampoco los anteriores a la creación del hábito.

Las sesiones registradas en días libres no cuentan como obligación pero se suman aparte
como **sesiones fuera de plan**, así que un entrenamiento extra suma sin poder bajar el
porcentaje. El bloque **Acumulado** muestra el total de cada hábito de cantidad o
cronómetro en la ventana elegida: horas entrenadas, páginas leídas, kilómetros.

**Colores.** El color pertenece al grupo, no al hábito, y se asigna solo al crear el primero
de ese grupo. Cambiarlo desde cualquier hábito recolorea todo el grupo. Las categorías de
notas funcionan igual.

**Rachas:** cuentan periodos consecutivos cumplidos. Un hábito semanal cuenta semanas y uno
mensual cuenta meses. El periodo en curso no rompe la racha mientras aún pueda completarse.

---

## Integración con Atajos de iOS

Con el Worker desplegado, un atajo puede registrar un gasto **sin abrir la app**:

1. **Pedir entrada** → tipo Número → `¿Cuánto?`
2. **Lista** con las categorías, en minúsculas:
   `comida`, `transporte`, `compras`, `ocio`, `hogar`, `salud`, `viajes`, `otros`
3. **Elegir de la lista** → mensaje `Categoría`
4. **Obtener contenido de una URL**:
   - URL: `https://TU-WORKER.workers.dev/col/gastos`
   - Método: `POST`
   - Encabezado: `Authorization` = `Bearer TU_CLAVE`
   - Cuerpo: JSON con `c` (Número, la entrada del paso 1) y `cat` (Texto, el elemento elegido)

Ese atajo se puede disparar desde una automatización de **Transacción** (al pagar con Apple
Pay), desde **Tocar atrás**, o desde el **Botón Acción**.

También puedes abrir la app en un punto concreto con parámetros de URL:

| Parámetro | Efecto |
|---|---|
| `?add=1` | Abre directamente el teclado de gastos |
| `?ver=habitos` | Abre un módulo: `hoy`, `finanzas`, `habitos`, `notas` o `ajustes` |
| `?cat=comida` | Preselecciona una categoría |

---

## Importar movimientos desde CSV

En **Ajustes → Importar movimientos desde CSV**. Pega el contenido del archivo, pulsa
*Analizar* para ver el recuento, y confirma.

```csv
fecha;importe;categoria;nota;tipo
06/09/2026;12,40;comida;Menú del día;gasto
05/09/2026;3,50;;MERCADONA;gasto
04/09/2026;1200;;Nómina de septiembre;ingreso
```

| Columna | Obligatoria | Formato |
|---|---|---|
| `fecha` | Sí | `dd/mm/aaaa` o `aaaa-mm-dd` |
| `importe` | Sí | Coma o punto decimal. El signo se ignora |
| `categoria` | No | `comida`, `transporte`, `compras`, `ocio`, `hogar`, `salud`, `viajes`, `otros` |
| `nota` | No | Texto, hasta 60 caracteres |
| `tipo` | No | `ingreso` o `gasto`. Por defecto `gasto` |

- El separador puede ser punto y coma o coma; se detecta solo.
- La fila de cabecera es opcional. Sin ella, se asume ese orden de columnas.
- Si `categoria` va vacía, se deduce del concepto: reconoce cadenas de supermercados,
  transporte, suministros, gimnasios y varias más.
- **Duplicados:** se omite cualquier fila con la misma fecha e importe que un movimiento ya
  registrado, así que puedes reimportar el mismo archivo sin miedo.

---

## Modelo de datos

Cuatro colecciones. Todos los items comparten `id` (identificador único) y `t` (marca de
tiempo en milisegundos). El campo `pend` es local: marca lo que aún no ha subido y nunca
se envía al servidor.

**gastos**
```js
{ id, t, c: 12.4, cat: 'comida', n: 'Menú del día', tipo: 'gasto' | 'ingreso' }
```

**habitos**
```js
{ id, t, nombre: 'Leer', grupo: 'Ocio', emo: '📖', color: '#3E6FA8',
  tipo: 'sino' | 'cantidad' | 'crono',
  frec: 'dia' | 'semana' | 'mes',
  dias: [1,2,3,4,5],        // 1 lunes … 7 domingo. Vacío = todos los días
  cuenta: true,             // false = solo seguimiento, fuera del círculo del día
  objetivo: 20, unidad: 'páginas', paso: 1, orden: 0, archivado: false }
```

**registros** — uno por hábito y periodo
```js
{ id: 'k3f9_2026-09-07', hab: 'k3f9', d: '2026-09-07', v: 24, t }
```

La clave de periodo `d` determina a qué unidad de tiempo pertenece:

| Periodicidad | Formato de `d` | Ejemplo |
|---|---|---|
| Cada día | `aaaa-mm-dd` | `2026-09-07` |
| Cada semana | `s` + lunes de esa semana | `s2026-09-07` |
| Cada mes | `m` + `aaaa-mm` | `m2026-09` |

Las semanas empiezan en lunes. Cambiar la periodicidad de un hábito no borra su historial:
los registros antiguos quedan con claves de otro formato y dejan de contar, pero reaparecen
si vuelves a la periodicidad original.

**notas**
```js
{ id, t, titulo: 'Idea', cat: 'Trabajo', color: '#4E8A5B', texto: '…', m: 1757000000000 }
```

### Claves de `localStorage`

Conservan el prefijo `vida.` del nombre anterior del proyecto. **No las cambies:** hacerlo
dejaría la app vacía en todos los dispositivos, porque no sabría dónde buscar los datos ya
guardados.

```
vida.gastos  vida.habitos  vida.registros  vida.notas
vida.cola.<colección>      ids borrados pendientes de subir
vida.nube                  { url, clave }
vida.ajuste.presupuesto    número
vida.ajuste.crono          { hab, inicio }
vida.ajuste.coloresGrupo   { grupo: color } — caché; el color viaja en cada hábito
vida.ajuste.coloresNota    { categoría: color } — caché; el color viaja en cada nota
vida.ultimaSync            marca de tiempo
```

---

## API del Worker

Todas las rutas exigen la cabecera `Authorization: Bearer <clave>`, salvo `/salud`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/salud` | Comprobación de vida. No pide clave |
| `GET` | `/col` | Índice de colecciones con su número de items |
| `GET` | `/col/<nombre>` | `{ items: [...], borrados: [ids] }` |
| `POST` | `/col/<nombre>` | Inserta o actualiza. Acepta un objeto o un array |
| `POST` | `/col/<nombre>/borrados` | Marca ids como borrados. Acepta uno o un array |

Las rutas antiguas `/gastos` y `/borrados` siguen funcionando como alias de
`/col/gastos`, por compatibilidad con la primera versión de la app.

**Comportamiento a tener en cuenta**

- Un `POST` sobre un id con lápida se ignora: lo borrado no resucita.
- Los importes aceptan coma decimal, porque Atajos en español la produce.
- Si ningún item del lote es válido, responde `400` en lugar de callar.
- Límites: 500 items por petición, 20.000 por colección, 4.000 caracteres por item.

**Códigos de error**

| Código | Significado |
|---|---|
| `400` | Cuerpo mal formado, o ningún item válido |
| `401` | Clave incorrecta o ausente |
| `404` | Ruta inexistente |
| `413` | Demasiados items en una sola petición |
| `507` | La colección alcanzó su límite |

---

## Sincronización y modo sin conexión

Cada escritura se guarda en el dispositivo y se marca como pendiente. La subida se
intenta al momento, y si falla queda en cola. Los pendientes se muestran con un punto
naranja en la lista y un globo naranja sobre la pestaña de Ajustes.

La sincronización se dispara al abrir la app, al recuperar la conexión, al volver a ella
tras veinte segundos fuera, y después de cada escritura.

**Resolución de conflictos.** Manda el servidor, salvo que el dispositivo tenga cambios sin
subir para ese mismo item, en cuyo caso ganan los locales. Los borrados dejan una lápida en
el servidor para que no reaparezcan desde otro dispositivo que llevara tiempo desconectado.

Dos detalles que evitan fallos sutiles:

- **Desmarcar un hábito no borra su registro**, lo pone a cero. Un borrado dejaría lápida
  y ese periodo no se podría volver a marcar nunca.
- **Deshacer un borrado crea el item con un identificador nuevo**, porque el servidor ya
  puede tener la lápida del anterior y volvería a eliminarlo en la siguiente sincronización.

---

## Copias de seguridad

**Ajustes → Descargar copia de seguridad** genera un JSON con las cuatro colecciones.
Guárdalo en iCloud Drive de vez en cuando.

Merece la pena aunque uses el Worker: el plan gratuito de Cloudflare no caduca, pero
depender de un único servicio sin copia local es cambiar un riesgo por otro.

**Restaurar desde copia** añade lo que falte sin tocar lo que ya haya, comparando por `id`,
así que no genera duplicados. Acepta tanto el formato actual como el array suelto de gastos
de las primeras versiones.

---

## Desarrollo

No hay compilación ni dependencias: son módulos nativos de JavaScript. Cualquier servidor
estático vale, pero **no abras `index.html` con doble clic**, porque el protocolo `file://`
bloquea los módulos.

```bash
python3 -m http.server 8000
# o
npx serve
```

Y abre `http://localhost:8000`.

**Al desplegar un cambio, sube el número de caché en `sw.js`:**

```js
const CACHE = 'myapp-v5';   // -> 'myapp-v6'
```

Si no, el service worker puede seguir sirviendo la versión anterior. La estrategia es red
primero con la caché como respaldo, así que normalmente el cambio llega solo, pero el
número de versión garantiza la limpieza de lo viejo.

**Convenciones del código.** Todo en español, incluidos nombres de variables y funciones.
Sin dependencias externas. Los estilos usan variables CSS para que el modo oscuro funcione
sin lógica adicional. Los módulos no se importan entre sí salvo a través de `nucleo.js`,
con dos excepciones deliberadas: `hoy.js` reutiliza las tarjetas de `habitos.js` y los
totales de `finanzas.js`.

---

## Resolución de problemas

**Pantalla en blanco tras publicar.** Los archivos JavaScript no están en `js/`, o
`index.html` no quedó en la raíz del repositorio. Abre la consola del navegador para ver
qué ruta da 404.

**Los cambios no llegan al móvil.** Es el service worker. Cierra la app del todo desde el
multitarea y ábrela dos veces. Si persiste, sube el número de caché en `sw.js` y vuelve a
desplegar.

**"El servidor respondió 404" al sincronizar.** El Worker desplegado es una versión anterior
que no conoce las rutas `/col/...`. Vuelve a desplegar con el `src/worker.js` actual.

**"Clave incorrecta".** Suele ser un espacio o un salto de línea colado al copiar. Vuelve a
introducirla en Ajustes. Si sigue, comprueba con `npx wrangler secret list` que el secreto
se llama exactamente `CLAVE`: si en la lista aparece la propia clave como nombre, se creó
mal y hay que borrarlo y rehacerlo.

**"No se pudo conectar".** La dirección está mal escrita o le falta el `https://`.
Comprueba `/salud` en el navegador.

**Veo datos distintos en Safari y en el icono.** Es el comportamiento de iOS: almacenamientos
separados. Configura el Worker en ambos.

**Errores de TLS con `curl` o `Invoke-RestMethod` en Windows.** PowerShell 5.1 y algunos
antivirus con inspección HTTPS no negocian bien con Cloudflare. Usa `curl.exe`, PowerShell 7,
o simplemente comprueba desde el navegador.

---

## Limitaciones conocidas

- **Sin notificaciones.** Una aplicación web instalada en iOS no puede avisarte con la app
  cerrada. El pomodoro solo suena si la tienes abierta; el tiempo, en cambio, se calcula
  desde la hora de inicio, así que puedes bloquear el móvil sin perder la cuenta.
- **Atajos no puede abrir el icono de la pantalla de inicio.** Los iconos de aplicación web
  no son apps y no se pueden invocar desde Atajos. Por eso el atajo escribe directamente
  contra el Worker en lugar de abrir la app.
- **La sincronización no está cifrada de extremo a extremo.** Cualquiera con la URL y la
  clave puede leer y escribir. Lo almacenado son importes, categorías y hábitos, sin datos
  bancarios, pero conviene saberlo.
- **El almacenamiento del navegador es frágil.** Si borras los datos de sitios web en
  Safari, se va la copia local. Con el Worker configurado se recupera al reconectar.
- **Un solo cronómetro a la vez.** Arrancar uno detiene el anterior y guarda su tiempo.

---

## Ideas pendientes

- Gastos recurrentes marcados como fijos, para separarlos de los variables en la proyección
- Cruzar módulos: comparar gasto con cumplimiento de hábitos
- Búsqueda en notas
- Reordenar hábitos arrastrando en lugar de con botones
- Vista de calendario mensual por hábito, para ver huecos de un vistazo
- Rotar la clave sin tener que actualizarla a mano en cada dispositivo
