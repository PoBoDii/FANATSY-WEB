# Fantasy Board

Panel web privado para consultar **LaLiga Fantasy** (el juego oficial de LNFP,
`com.lfp.laligafantasy`). Sólo lectura: muestra tu plantilla, la clasificación de
tu liga, la plantilla de cualquier rival, el mercado y el histórico de cada
jugador. No alinea, no ficha, no puja.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # rellena FANTASY_EMAIL y FANTASY_PASSWORD
npm run dev                    # http://localhost:3000
```

> **Importante:** la cuenta de Fantasy tiene que estar creada con **email +
> contraseña**. El login social (Google, Facebook, Apple) no permite el flujo
> que usa este panel. Si ya la tienes con Google, usa `FANTASY_TOKEN` (ver abajo).

## Cómo funciona la conexión

Todo pasa en el servidor; el navegador nunca ve tus credenciales ni el token.

1. **Login** — `POST https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_ResourceOwnerv2`
   con `grant_type=password`. Es el Azure AD B2C de LaLiga; la policy
   `ResourceOwner` permite cambiar email+contraseña por tokens sin navegador.
   Devuelve un `id_token` (que la API acepta como Bearer) y un `refresh_token`.
2. **Renovación** — el token dura ~24 h. `src/lib/auth.ts` lo cachea en memoria
   y lo renueva solo con el `refresh_token`; si eso también caduca, vuelve a
   hacer login. Nunca tendrás que tocar nada a mano.
3. **Datos** — `https://fantasy-api.llt-services.com/api`, con
   `Authorization: Bearer …` y `x-lang: es`.

Al llamar desde Server Components **no hay problema de CORS**, que es lo que
obliga a las apps de escritorio a montar un proxy local.

### `competitionId` es obligatorio

**El detalle que más tiempo cuesta descubrir.** Casi todos los endpoints exigen
`?competitionId=1`. Sin él la API **no** devuelve 400 con un mensaje útil: suelta
un `500 Internal Server Error` genérico, que parece una avería del servidor o una
cuenta sin datos. El cliente lo añade solo a cada petición.

### Endpoints usados

Todos verificados contra el host real con una cuenta con liga.

| Vista | Endpoint |
|---|---|
| Usuario | `/v3/user/me` |
| Ligas | `/v3/leagues` |
| Detalle de liga | `/v3/leagues/{liga}` |
| **Clasificación + plantillas rivales** | `/v5/leagues/{liga}/teams` |
| Plantilla | `/v3/leagues/{liga}/teams/{equipo}` |
| Alineación | `/v3/teams/{equipo}/lineup` |
| Saldo | `/v3/teams/{equipo}/money` |
| Mercado | `/v3/league/{liga}/market` — `league` en **singular** |
| Actividad | `/v5/leagues/{liga}/activity` |
| Ficha de jugador | `/v3/player/{jugador}/league/{liga}` |
| Histórico de valor | `/v3/player/{jugador}/market-value` |
| Jornada actual | `/v3/week/current` |
| Calendario | `/v3/calendar` |

Tres rarezas que cuestan encontrar:

- **La clasificación y la actividad están en `v5`**, no en `v3`. Las rutas `v3`
  equivalentes devuelven 404.
- `/v5/leagues/{liga}/teams` es el endpoint más útil de todos: trae cada equipo
  con su manager, posición, puntos, valor **y su plantilla completa**. De ahí
  salen a la vez la clasificación y las plantillas de los rivales.
- El prefijo `/v3/competition/{id}/` de los proyectos de temporadas anteriores
  **ya no existe**.

### Formas de respuesta que sorprenden

- La **alineación no es una lista plana**: llega como
  `formation.{goalkeeper,defender,midfield,striker,coach}` más `bench`, y la
  disposición en `formation.tacticalFormation` (p. ej. `[4,4,2]`).
- El jugador real cuelga de `playerMaster`; el nodo exterior es la relación
  jugador↔equipo (`buyoutClause`, `buyoutClauseLockedEndTime`, `playerTeamId`).
- `positionId`: 1 portero, 2 defensa, 3 medio, 4 delantero y **5 entrenador**.
- La actividad identifica a la gente por `user1Id`/`user2Id`, no por nombre; los
  nombres se resuelven cruzando con `/v5/leagues/{liga}/teams`.

## Probabilidad y precios (futbolfantasy.com)

LaLiga no publica onces probables ni la variación diaria de valor, así que esos
datos se sacan de [futbolfantasy.com](https://www.futbolfantasy.com) por
scraping, en [`src/lib/futbolfantasy.ts`](src/lib/futbolfantasy.ts).

Son **dos fuentes distintas**, por necesidad:

1. **`/analytics/laliga-fantasy/mercado`** — UNA página con los 608 jugadores.
   Cada `<tr>` lleva en sus `data-*` el valor de hoy y el de hace 1/2/3/7/14/30
   días con diferencias y porcentajes. Es la espina dorsal: su `data-nombre` ya
   viene normalizado y casa con el nombre completo de LaLiga.
2. **`/laliga/equipos/{slug}`** — 20 páginas, una por club, de donde sale la
   probabilidad (`<span class="prob-N">70%</span>`).

**La (2) no la publica para todos**: sólo para los del once proyectado. Un
fichaje reciente como Dumfries no sale ahí aunque su ficha individual sí lo
tenga. Para esos hay un tercer recurso puntual —
`probabilityFromProfile()` — que pide la ficha del jugador. Se usa **sólo** para
jugadores ya en pantalla y en tandas cortas, nunca en bloque.

**El cruce se hace club por club.** Acotar a ~30 jugadores hace que baste el
apellido y evita confundir homónimos de equipos distintos. Dos trampas que
costaron cobertura:

- El slug de la ficha **no siempre es el nombre completo**: Ratiu es `ratiu`, no
  `andrei-ratiu`. Por eso el slug se lee de la página del club en vez de
  deducirlo del nombre — si no, el respaldo por ficha individual da 404.
- El desplegable de equipos dice **"Rayo"** pero la página es
  `rayo-vallecano`. Con comparación exacta, un club entero se quedaba sin
  probabilidades. Se acepta que un nombre sea prefijo del otro.
- `data-nombre` viene en minúsculas pero **conserva la ñ** ("iñigo vicente").
  Parece normalizado y no lo está: hay que pasarlo por `normalizeName` o
  ningún jugador con ñ casa jamás.
- Quien sale en la página del club pero **no cotiza** en la tabla de precios
  entra igualmente al índice, como ficha sin precio, para no perder ni su
  probabilidad ni su club.
- Los slugs llevan **sufijo numérico** para desambiguar homónimos
  (`manu-fernandez-1`); hay que quitarlo antes de comparar.
- futbolfantasy usa **diminutivos** donde LaLiga pone el nombre largo: "Manu
  Fernández" contra "Manuel Fernández". Se acepta que un nombre de pila sea
  prefijo del otro (mínimo 3 letras), siempre con el apellido igual y el club
  como desempate.

Con todo eso el índice recoge **las 451 probabilidades que publica
futbolfantasy**. Lo que queda fuera es lo que sencillamente no existe en su web
— Alemâo, por ejemplo, no aparece en ninguno de los 20 equipos.

- **Cruce de nombres**: LaLiga y futbolfantasy no comparten identificadores. Se
  cruza por nombre normalizado (sin acentos ni puntuación) probando, de más
  fiable a menos: nombre completo, slug y apodo; los homónimos se desempatan por
  club. Si nada casa, un último pase acepta los segundos nombres ("Diego
  Llorente" contra "diego javier llorente", que además convive con "marcos
  llorente").
- **Si se rompe**: todo degrada a `null` en silencio. El panel sigue
  funcionando y simplemente no se enseña la probabilidad.

### Por qué escala

El coste es **fijo**: 21 peticiones y un parseo, pase lo que pase. Da igual
mirar 14 jugadores que los 678 del juego — se construye un índice entero de
LaLiga y cada consulta es un acceso a un `Map`.

| | |
|---|---|
| Descarga | ~122 KB por página comprimida |
| Tiempo | ~2 s en paralelo, de 5 en 5 |
| Parseo | ~11 ms |
| Frecuencia | cada 5 min |
| Consultar un jugador | 0 peticiones |

El índice vive en memoria del proceso. Cuando caduca se sirve **el anterior al
momento** y se refresca por detrás, así que ninguna carga de página paga los
2 s. Los refrescos concurrentes se funden en una sola promesa, y si la fuente
se cae entera se conserva el índice viejo antes que quedarse sin nada.

Los datos de LaLiga (mercado, plantillas, alineación, actividad) van con
`revalidate: 0` — siempre frescos. Además, las vistas llevan
[`AutoRefresh`](src/components/AutoRefresh.tsx), que revalida los Server
Components cada 60 s sin recargar la pestaña ni perder el scroll, y se detiene
mientras la pestaña está en segundo plano.

### Cobertura

futbolfantasy publica ~375 probabilidades de 608 jugadores indexados; LaLiga
Fantasy tiene 678. De una muestra de 150 al azar: 95 casan directos, 13 por
apellido + nombre de pila + club y 42 no están en la fuente. El techo es de la
fuente, no del código; el respaldo por ficha individual recupera parte de ese
hueco para los jugadores que estés mirando.

**Cuidado con el desempate.** Una clave de una sola palabra es un apellido, y
ahí el club NO basta: "Diego Gómez" tiene de candidatos a Moi, Sergio, Laro y
Valentín Gómez, y desempatar sólo por club le habría colgado la probabilidad de
otro jugador. Por eso el cruce por apellido exige **además** que coincida el
nombre de pila. Sin datos es mejor que con datos falsos: cuando no hay, la
interfaz pone `s/d` en vez de callarse.

### Qué más se saca de ahí

El `<a>` de cada jugador en la página del club lleva sus estadísticas en
`data-*`: `data-totalGoles`, `data-totalAsistencias`, `data-totalAmarillas`,
`data-totalRojas` y **`data-jerarquia`** (0-100, cuánto cuenta para su
entrenador). Son las que alimentan el selector del once.

Los **avisos** (partes médicos y noticias de fichajes) van en bloques
`.elemento` aparte, con enlace a la noticia original y etiquetas tipo "Interés"
o "Cedible". Se parsean en `parseAlerts()` y salen como insignia en el campo,
las listas y el mercado.

> **Ojo con anidar enlaces.** La insignia de aviso es un `<a>` y las filas
> también lo eran, y un `<a>` dentro de otro es HTML inválido. Las filas usan
> ahora un enlace extendido (`absolute inset-0`) que cubre la fila sin envolver
> su contenido; la insignia se levanta con `relative z-10`.

### Escala de color

| Probabilidad | Color | Lectura |
|---|---|---|
| ≥ 95 % | morado | Fijo |
| ≥ 90 % | azul | Casi seguro |
| ≥ 65 % | verde | Probable |
| 51-64 % | lima | Puede jugar |
| 41-50 % | amarillo | Duda |
| 26-40 % | naranja | Poco probable |
| ≤ 25 % | rojo | Muy difícil |

## Alineaciones probables

Sección propia, también de futbolfantasy
([`src/lib/alineaciones.ts`](src/lib/alineaciones.ts)):

- **Partidos de una jornada**: `/laliga/posibles-alineaciones/{jornada}`. El
  parámetro va en la ruta, no en query — `?jornada=3` te devuelve la 1.
- **Once de un equipo en un partido**:
  `/api/alineaciones/{partido}/{equipo}`, que es el endpoint que su propia web
  usa por AJAX. El id de equipo sale de la URL del escudo (`escudom/{id}.png`).

**La probabilidad es del hueco, no del jugador.** Esto es lo que hay que
entender para parsearlo bien: cada posición del campo es un
`<div class="jugador_{id} tipo_campo …">` con **un porcentaje** y dentro el
favorito más quienes le disputan el puesto. Leyéndolo jugador a jugador, los
suplentes salían sin dato — no es que falte, es que comparten el del hueco.

El wrapper trae además la posición (`data-posicion`) y hasta las coordenadas
sobre el césped (`style="left: 76%; top: 69%"`). Los once titulares son los
diez `tipo_campo campo` más el único `tipo_campo portero`; las clases
`supl-NNN` marcan las filas del banquillo. La foto se compone con el id del
wrapper: `media.futbolfantasy.com/…/jugadores/ficha/{id}.png`.

## Calendario y dificultad

De `/laliga/equipos/{slug}/partidos` ([`src/lib/equipos.ts`](src/lib/equipos.ts)).
La dificultad la calcula futbolfantasy y la publica como clase CSS:
`id-m-asequible · id-asequible · id-igualado · id-dificil · id-m-dificil`.

> **Los ids de equipo no se pueden deducir.** No siguen orden alfabético ni
> ninguna lógica: Racing es el 42, Villarreal el 22, Elche el 21. Están sacados
> uno a uno del desplegable de su tabla de mercado. Adivinarlos falla en 13 de
> 20 y el síntoma es sutil: a un jugador del Málaga le sale el calendario del
> Levante.

## Pronóstico de partidos

Modelo de **Poisson bivariante con corrección de Dixon-Coles**, el estándar en
predicción de fútbol desde Maher (1982), en
[`src/lib/pronostico.ts`](src/lib/pronostico.ts). **No son cuotas**: ninguna
casa de apuestas publica sus probabilidades en abierto de forma fiable.

Los datos salen de `/laliga/clasificacion[/{año}]`, que publica la tabla **con
desglose de casa y fuera** — goles a favor y en contra en cada condición, que es
exactamente lo que el modelo necesita.

1. A cada equipo se le estiman cuatro fuerzas **separando casa y fuera**, porque
   no rinden igual en los dos sitios.
2. Los goles esperados salen de cruzar el ataque de uno con la defensa del otro.
3. Se calcula la probabilidad de cada marcador con dos Poisson y se agregan
   en 1, X y 2.
4. La corrección de Dixon-Coles reajusta los marcadores bajos (0-0, 1-0, 0-1,
   1-1), donde la Poisson pura se queda corta.

La ventaja de campo **no se añade a mano**: ya está dentro de las medias de la
liga (1,45 goles del local contra 1,17 del visitante).

> **Regresión a la media, imprescindible.** Media temporada son 19 partidos y a
> esa escala el ruido pesa. Sin encoger las fuerzas hacia 1, cruzar un ataque
> flojo con una buena defensa multiplica dos estimaciones exageradas: el
> Alavés–Getafe daba 0,53 goles esperados. Con encogimiento sale 0,68, que ya es
> creíble.

Encima se aplican el **estado de forma** (últimos cinco, con peso pequeño), un
empujón leve de la **dificultad de futbolfantasy**, y para los **recién
ascendidos** —que no tienen histórico en Primera— una estimación por valor de
plantilla.

### Validación

Ejecutado sobre las 380 combinaciones de la temporada pasada:

| | Modelo | Real |
|---|---|---|
| Goles esperados local | 1,46 | 1,45 |
| Goles esperados visitante | 1,17 | 1,17 |
| Victoria local / empate / visitante | 42,9 / 25,6 / 31,5 % | 46 / 24 / 30 % |

> **Nunca caches un fallo con marca de tiempo nueva.** Si la descarga falla y
> guardas el resultado vacío como si fuera bueno, la jornada se queda en blanco
> durante todo el TTL y parece que el parser se ha roto. Tanto `getMatches`
> como `getFixtures` sólo escriben en caché cuando han obtenido algo.

## Rendimiento

Pensado para usarse en el móvil, así que la navegación tiene que ser inmediata:

- `getSession()` va envuelto en `cache()` de React. Se llama desde el layout
  **y** desde cada página, y sin eso cada carga pedía `/user/me` y `/leagues`
  dos veces.
- Los datos que cambian a todas horas (mercado, plantillas, pujas) pasaron de
  `revalidate: 0` a **15 s**: moverse entre pestañas ya no vuelve a pedirlo
  todo, y el refresco automático de 60 s sigue manteniéndolo al día.
- Las páginas de futbolfantasy pesan entre 1 y 5 MB y el caché de datos de Next
  rechaza cualquier cosa por encima de 2 MB. Antes lo intentaba en cada carga y
  fallaba; ahora van con `cache: "no-store"` y se apoyan sólo en la memoización
  propia.
- `loading.tsx` da un esqueleto instantáneo al navegar.
- Desarrollo con **Turbopack** (`npm run dev`).

Tiempos medidos: 125-550 ms por página con el índice ya construido.

> Si en desarrollo aparece *"Could not find the module … in the React Client
> Manifest"*, es un manifiesto obsoleto de Turbopack tras muchas recargas en
> caliente, no un fallo del código: se arregla reiniciando `npm run dev`.

## Si algo devuelve 500

Lo primero que hay que mirar es si le falta `competitionId` — es la causa del
99 % de los 500 de esta API. `/v3/user/me` funciona sin él, y por eso el panel
lo usa como prueba de vida: si tu perfil llega pero otra cosa falla, el problema
no es el login.

## Si una vista sale vacía

LaLiga renombra campos entre temporadas. Ve a **`/debug`**, lanza el endpoint que
falle y mira el JSON real; luego ajusta el mapeo en
[`src/lib/normalize.ts`](src/lib/normalize.ts). Los normalizadores ya aceptan
varios nombres alternativos por campo, así que normalmente basta con añadir uno
a la lista.

## Desplegar

Funciona tal cual en **Vercel** (`vercel` o importando el repo) y en **Netlify**
con `@netlify/plugin-nextjs`. Configura en el panel del proveedor:

- `FANTASY_EMAIL`, `FANTASY_PASSWORD`
- `APP_PASSWORD` — si no la pones, tu panel queda **público**. Con ella, se entra
  una vez con `https://tu-web/?key=LA_CLAVE` y queda una cookie.

## Estructura

```
src/lib/auth.ts        login B2C, caché y refresco del token
src/lib/api.ts         cliente de la API + lista de endpoints
src/lib/normalize.ts   aplana las respuestas a un modelo estable
src/lib/session.ts     resuelve la liga activa
src/components/        Pitch (campo), charts, tarjetas, tablas
src/app/               una carpeta por vista
```
