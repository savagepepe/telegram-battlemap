# Telegram Battle Map

Progetto separato dal bot dei dadi. Prima struttura pubblicata: Cloudflare Worker, schema D1, Mini App con griglia e pedine trascinabili in modalità demo locale.

## Stato attuale

La demo funziona localmente nel browser ma NON è ancora una battaglia condivisa. Non sono ancora implementati autenticazione Telegram, ruoli Master, sincronizzazione, carte iniziativa, ripesca, caricamento immagini e persistenza delle pedine. Non usare in partite reali finché queste API non saranno completate.

## Preparazione Cloudflare

1. Crea un database D1 denominato battlemap-db.
2. Inserisci il suo database_id in wrangler.jsonc.
3. Installa le dipendenze con npm install.
4. Esegui npm run db per creare le tabelle.
5. Esegui npm run deploy per pubblicare il Worker e la demo.

Non pubblicare token Telegram nel repository. Il bot Telegram sarà collegato in una fase successiva tramite secret e webhook protetto.
