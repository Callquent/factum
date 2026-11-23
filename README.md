# Mes factures (Next.js + Prisma + SQLite)

    npm install
    npx prisma db push      # à relancer après chaque mise à jour du projet
    npm run dev

- Import PDF (texte extrait côté serveur) ou photo (OCR dans le navigateur) ; saisie manuelle si rien n'est lu
- Le fichier d'origine est conservé dans la base SQLite (aucun dossier à sauvegarder en plus de prisma/dev.db) ; « Voir » l'ouvre
- Modifier une facture (champs, remplacement ou retrait du fichier) ; recherche par entreprise, montant, date, référence, nom de fichier
