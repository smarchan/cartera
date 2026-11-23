# Cartera

Seguimiento de una cartera de inversión en tiempo real y en varias divisas. Next.js 15 con una API propia que consulta Yahoo Finance (acciones, ETF, fondos, cripto y divisas) y, como respaldo para los tipos de cambio, el BCE (Frankfurter).

## Qué hace

- Valor total, coste, beneficio total, no realizado y realizado, y variación del día.
- Posiciones con precio medio de compra (comisiones incluidas), precio actual, peso, resultado del día y beneficio, separando el **efecto precio** del **efecto divisa**.
- Operaciones en cualquier moneda: por ejemplo, una acción que cotiza en USD comprada pagando en EUR. Toma el tipo de cambio de mercado de ese día o el que te aplicó el bróker.
- Ventas a coste medio ponderado, con posiciones cerradas y precio medio de venta.
- Gráfico de evolución (valor frente a coste) con rentabilidad ponderada en el tiempo (TWR) para 1S, 1M, 3M, YTD, 1A y Todo.
- Resultado por días, meses y años, con una tabla de rentabilidad mensual por año.
- Distribución por activo, divisa o tipo.
- Moneda de la cartera: EUR, USD, GBP, CHF o JPY.
- Exportar e importar en CSV o JSON. Los precios se actualizan cada 30 s mientras la pestaña está visible.

Los datos se guardan en el `localStorage` del navegador: no hay cuentas ni base de datos. Haz copias con «⋯ → Copia de seguridad (JSON)».

## Desplegar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com: **Add New → Project →** importa el repositorio y pulsa **Deploy**. No hace falta ninguna variable de entorno.

O desde la terminal: `npm i -g vercel && vercel --prod`.

## Desarrollo local

```bash
npm install
npm run dev                     # precios reales
PRICE_SOURCE=mock npm run dev   # precios simulados, sin red
npm test                        # tests del motor de cálculo
```

## Formato CSV de importación

```
fecha,tipo,simbolo,nombre,cantidad,precio,moneda,comision,tipo_cambio,moneda_base
2024-03-04,compra,AAPL,Apple Inc.,15,175.10,USD,1,,
2025-04-07,compra,MSFT,Microsoft,6,322,EUR,2,,
2025-02-10,venta,NVDA,,15,133.60,USD,1,0.9612,EUR
```

También acepta `;` como separador, decimales con coma y fechas `dd/mm/aaaa`. Los símbolos son los de Yahoo Finance (`SAN.MC`, `IWDA.AS`, `VUSA.L`, `BTC-EUR`…).

## Límites a tener en cuenta

- La API de Yahoo no es oficial: puede cambiar o limitar peticiones sin aviso. Toda la lógica de datos está en `lib/server/market.ts`, así que cambiar de proveedor (Twelve Data, Finnhub, EODHD) supone tocar solo ese archivo.
- Algunos mercados llegan con unos 15 minutos de retraso.
- Los dividendos no se registran todavía.
