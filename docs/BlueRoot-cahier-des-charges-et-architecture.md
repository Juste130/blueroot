# BlueRoot : cahier des charges et architecture logicielle sécurisée

Version 1.0 · 11 octobre 2026 · Auteur : HOUEZO Sènami Juste (Juste13) · Hackathon mondial IEEE ClimateChain 2026 · Piste : Marchés du carbone et transparence des émissions

## 1. Résumé exécutif

**BlueRoot** est un registre de preuve du carbone bleu. Il permet à des communautés qui restaurent des mangroves au sud du Bénin de prouver leur action, d'obtenir des crédits vérifiés exprimés en hectares-années, et de les financer via une place de marché transparente, sans double comptage possible.

Principe en une ligne : **enregistrer une zone, prouver (terrain + satellite + IA), faire valider par deux validateurs, émettre, vendre, retirer avec un certificat public.**

**Executive summary (EN).** BlueRoot is an open-source registry and verification platform for community mangrove restoration in Benin. It combines on-chain spatial uniqueness (no double counting), two-source evidence (geotagged field photos and a satellite vegetation index), AI-assisted reporting (advisory only), two-validator human attestation, a buffer pool against non-permanence risk, an enforced community revenue share, and public retirement certificates. It is built with Solidity and Foundry, and a single Next.js application.

## 2. Contexte et problème

- Les petits projets communautaires sont souvent exclus des marchés carbone, car la vérification par un tiers coûte cher.
- Le double comptage (la même zone revendue deux fois) et le manque de transparence minent la confiance.
- Les preuves sont difficiles à auditer par un tiers.

**Travaux antérieurs.** Le GROVE Forest Smart Ledger (Global Mangrove Trust, Climate Finance Lab, 2020) cible déjà le financement de petits projets de mangroves avec télédétection et contrats intelligents (https://www.climatepolicyinitiative.org/publication/grove/). BlueRoot ne prétend pas être le premier. Sa différence tient à des garanties techniques appliquées au niveau du contrat (anti-chevauchement, réserve tampon, part communauté), à la preuve à deux sources, et à un ancrage béninois réel avec un code ouvert et testé.

## 3. Objectifs et périmètre

**Objectifs**

1. Empêcher techniquement le double comptage d'une même zone.
2. Réduire le coût de vérification par des preuves croisées et un rapport assisté par IA.
3. Garantir une part minimale aux communautés, de façon vérifiable.
4. Offrir une transparence publique complète sur projets, preuves et crédits.

**Inclus dans le MVP :** fonctionnalités F1 à F12 (section 5).

**Bonus si le temps le permet :** F13 (réputation des validateurs) et F14 (signalement d'inversion).

**Hors périmètre :** certification par un standard reconnu (Verra, Gold Standard), mesure précise des tonnes de CO2, KYC réel, déploiement mainnet, paiements en monnaie fiat, multi-chaînes, polygones exacts (le MVP utilise des cellules H3), application mobile native.

**Contraintes et hypothèses :** développement solo en environ 14 jours, testnet uniquement, données de démonstration réalistes, sources de données ouvertes dont les conditions d'usage sont à vérifier.

## 4. Acteurs et rôles

| Acteur | Rôle | Droits principaux |
|---|---|---|
| Porteur de projet | Communauté ou ONG qui restaure la mangrove | Enregistrer un projet, soumettre des preuves, lister des crédits à la vente |
| Agent terrain | Collecte photos et relevés | Envoyer des preuves géolocalisées pour un projet |
| Validateur | Expert indépendant | Approuver ou rejeter un dossier (jamais le sien) |
| Acheteur | Entreprise ou particulier | Acheter, retirer, obtenir un certificat |
| Service d'ancrage | Wallet serveur de l'application | Ancrer les hashes de rapports (rôle unique, limité) |
| Administrateur | Gouvernance du registre | Gérer les rôles, paramètres, pause d'urgence (multisig) |
| Public | Tout visiteur | Consulter le tableau de bord et vérifier un certificat |

## 5. Exigences fonctionnelles détaillées

### F1. Connexion par wallet et gestion des rôles
- Acteurs : tous.
- Description : connexion par signature de message (SIWE), rôles on-chain via AccessControl.
- Règles : aucun mot de passe stocké ; un wallet peut cumuler des rôles sauf validateur et porteur sur un même projet.
- Critères d'acceptation : un wallet sans rôle ne peut appeler aucune fonction réservée ; les changements de rôle émettent un événement.

### F2. Enregistrement d'un projet et de sa zone
- Acteur : porteur de projet.
- Description : saisie du nom, de la description, du wallet communauté, et dessin de la zone sur une carte, convertie en cellules H3.
- Règles : un nombre maximal de cellules par transaction (par exemple 100), plusieurs transactions possibles ; les métadonnées sont stockées sur IPFS, leur hash on-chain.
- Critères d'acceptation : le projet reçoit un identifiant ; ses cellules sont enregistrées ; un événement `ProjectRegistered` est émis.

### F3. Contrôle anti-chevauchement
- Acteur : contrat (automatique).
- Description : une cellule H3 ne peut appartenir qu'à un seul projet actif.
- Règles : si une cellule est déjà revendiquée, la transaction échoue avec une erreur explicite ; la cellule est libérée seulement si le projet est clôturé par l'administration.
- Critères d'acceptation : test d'enregistrement concurrent de deux projets sur la même cellule, le second est rejeté.

### F4. Soumission de preuves terrain
- Acteurs : agent terrain, porteur de projet.
- Description : envoi de photos et relevés depuis une PWA (conçue pour connexions faibles).
- Règles : vérification côté serveur du type et de la taille des fichiers, lecture des métadonnées EXIF (position, date), contrôle que la position tombe dans les cellules du projet, détection de photos dupliquées (hash perceptuel) ; les fichiers sont envoyés en IPFS privé, leur hash enregistré.
- Critères d'acceptation : une photo hors zone ou dupliquée est signalée dans le rapport ; aucun fichier non valide n'est stocké.

### F5. Analyse satellite (indice de végétation)
- Acteur : script hors ligne + application.
- Description : un script calcule l'évolution de l'indice de végétation (NDVI) sur la zone, avec une base de départ et la dernière mesure, et produit un JSON versionné (source, dates, paramètres, valeurs). Le hash du JSON est ancré on-chain.
- Règles : résultats pré-calculés pour 2 ou 3 zones de démonstration ; un recalcul en direct sur une seule zone pour la démo.
- Critères d'acceptation : l'application affiche la courbe et le score satellite ; le hash affiché correspond au fichier.

### F6. Analyse IA et rapport de vérification
- Acteur : service d'ancrage (route serveur).
- Description : l'IA reçoit les métadonnées des preuves, les résultats des contrôles et la série satellite, puis produit un rapport structuré (JSON validé par un schéma) : incohérences, points forts, score proposé.
- Règles : l'IA est consultative et ne signe aucune transaction ; sa sortie est validée par un schéma strict ; le rapport est publié sur IPFS public et son hash ancré on-chain.
- Critères d'acceptation : toute sortie non conforme au schéma est rejetée et journalisée ; le rapport est lisible par tous.

### F7. Validation humaine par deux validateurs
- Acteur : validateur.
- Description : examen du dossier (preuves via accès temporaire, rapport, courbe satellite) puis vote approbation ou rejet.
- Règles : deux approbations distinctes sont requises ; un validateur ne peut pas valider son propre projet ni voter deux fois ; chaque vote est lié au hash du rapport examiné ; fenêtre de validation limitée dans le temps.
- Critères d'acceptation : un vote sur un rapport modifié est refusé ; l'événement `ClaimFinalized` n'est émis qu'avec deux approbations.

### F8. Émission de crédits avec réserve tampon
- Acteur : contrat (déclenché à la finalisation).
- Description : création de crédits ERC-1155 (un identifiant par projet et millésime), exprimés en centièmes d'hectare-année vérifié.
- Règles : un pourcentage est placé dans la réserve tampon (non transférable) pour couvrir le risque de disparition de la mangrove ; le reste va au porteur ; la quantité ne peut dépasser celle calculée par la règle métier (section 6).
- Critères d'acceptation : somme tampon + net égale au total émis ; un dossier ne peut être finalisé qu'une seule fois.

### F9. Place de marché simple
- Acteurs : porteur de projet (vendeur), acheteur.
- Description : mise en vente à prix fixe, achat avec un jeton de test de type stablecoin.
- Règles : à chaque achat, le paiement est réparti automatiquement par le contrat : part communauté (minimum garanti), frais de plateforme, solde au porteur ; protection contre la réentrance.
- Critères d'acceptation : la part communauté reçue est toujours supérieure ou égale au minimum paramétré, quel que soit le prix.

### F10. Retrait de crédits et certificat public
- Acteur : acheteur.
- Description : le retrait brûle les crédits et enregistre un bénéficiaire et une raison (hash). Une page de certificat publique se construit à partir de l'événement on-chain.
- Règles : un crédit retiré ne peut plus être transféré ; le certificat affiche projet, quantité, date, transaction et hash du rapport.
- Critères d'acceptation : toute personne peut vérifier un certificat à partir du hash de transaction.

### F11. Tableau de bord public
- Acteur : public.
- Description : carte des projets, crédits émis, vendus, retirés, réserve tampon, historique des validations, courbes satellite.
- Critères d'acceptation : toutes les valeurs affichées sont lisibles depuis la chaîne ou depuis des fichiers dont le hash est vérifiable.

### F12. Journal d'audit et événements
- Acteur : système.
- Description : tous les changements d'état importants émettent un événement ; l'application indexe ces événements pour l'historique.
- Critères d'acceptation : chaque étape du cycle de vie d'un projet est reconstituable à partir des événements.

### F13 (bonus). Réputation des validateurs
- Score qui évolue selon la concordance des votes avec le contrôle satellite ; affichage public.

### F14 (bonus). Signalement d'inversion
- Deux validateurs peuvent signaler une perte constatée de mangrove ; la réserve tampon du projet est alors réduite et le projet suspendu.

## 6. Règles métier et paramètres

Les valeurs ci-dessous sont des **valeurs d'exemple à valider avec un expert** ; elles sont configurables par l'administration.

| Paramètre | Valeur d'exemple | Remarque |
|---|---|---|
| Unité de crédit | 0,01 hectare-année vérifié | Pas de promesse de tonnes de CO2 certifiées |
| Résolution H3 | 10 (environ 1,5 ha par cellule) | Compromis précision et coût en gas |
| Réserve tampon | 20 % | Risque de non-permanence |
| Part communauté minimale sur ventes | 50 % | Appliquée par le contrat |
| Frais de plateforme | 2 % | Plafonné dans le contrat |
| Validations requises | 2 | Validateurs distincts |
| Seuil de score combiné | 70 / 100 | En dessous, dossier renvoyé |

**Calcul de la quantité vérifiée (documenté et transparent) :**

score combiné = pondération entre score satellite, score des preuves terrain et score de cohérence IA (poids à calibrer, par exemple 40 %, 40 %, 20 %).

quantité vérifiée = surface en hectares × durée en années × (score combiné / 100), seulement si le score atteint le seuil.

Le facteur et les poids sont des hypothèses de démonstration, présentés comme tels dans l'interface.

## 7. Architecture logicielle

### 7.1 Vue d'ensemble

| Couche | Technologies | Rôle |
|---|---|---|
| Smart contracts | Solidity, OpenZeppelin, Foundry | Règles de confiance : unicité des zones, validation, émission, vente, retrait |
| Réseau | Testnet EVM (à choisir selon faucet disponible) | Déploiement de la démo |
| Application | Next.js (App Router), TypeScript, wagmi et viem | Interface et route handlers (pas de backend séparé) |
| Cartographie | MapLibre ou Leaflet, h3-js | Dessin des zones et cellules |
| IA | API Claude appelée côté serveur | Rapport de vérification consultatif |
| Stockage fichiers | Pinata (IPFS public et privé) | Rapports publics, preuves brutes privées |
| Base d'index (optionnelle) | Postgres hébergé et Drizzle | Lecture rapide de l'historique |
| Données satellite | Script Python ou Node, JSON versionnés | NDVI pré-calculé |
| Hébergement | Vercel | Un seul déploiement |

### 7.2 Flux principal

1. Le porteur enregistre le projet : cellules H3 sur la chaîne, métadonnées sur IPFS.
2. Les agents envoient des preuves : contrôles serveur, stockage privé, hash enregistré.
3. Le script satellite produit la série NDVI : hash ancré.
4. La route d'analyse produit le rapport IA : stockage public, hash ancré par le service d'ancrage.
5. Deux validateurs examinent et approuvent.
6. Le contrat émet les crédits (tampon et net).
7. Le porteur met en vente ; l'acheteur achète, la répartition est automatique.
8. L'acheteur retire ; le certificat public est généré depuis l'événement.

### 7.3 Principes de conception

- **Minimum on-chain :** seulement les règles de confiance et des hashes, jamais de données brutes ni personnelles.
- **Calcul hors chaîne, preuve de l'intégrité sur la chaîne.**
- **Simplicité :** contrats non upgradeables pour le MVP afin de réduire la surface d'attaque, limite assumée.
- **Un seul dépôt** avec des dossiers `contracts/`, `scripts/satellite/`, `docs/`, avec l'app Next.js à la racine.

## 8. Conception des smart contracts

### ProjectRegistry
- `registerProject(metadataHash, communityWallet)` crée le projet.
- `addCells(projectId, cells[])` ajoute des cellules, avec un maximum par appel ; échoue si une cellule est prise.
- `closeProject(projectId)` réservé à l'administration, libère les cellules.
- Événements : `ProjectRegistered`, `CellsAdded`, `ProjectClosed`.

### Verification
- `anchorReport(projectId, reportHash, satelliteHash, score)` réservé au service d'ancrage.
- `attest(claimId, approve)` réservé aux validateurs, lié au hash du rapport.
- `finalize(claimId)` possible quand deux approbations distinctes existent.
- Garde-fous : pas d'auto-validation, pas de double vote, fenêtre de temps, rapport non modifiable après ancrage.

### CarbonCredit (ERC-1155)
- Émission uniquement par `Verification` à la finalisation, avec réserve tampon non transférable.
- `retire(tokenId, amount, beneficiary, reasonHash)` brûle et émet `CreditsRetired`.

### Marketplace
- `list(tokenId, amount, price)`, `buy(listingId, amount)`, `cancel(listingId)`.
- Répartition atomique du paiement : communauté, plateforme, porteur ; `nonReentrant`, SafeERC20.

### Invariants à tester
1. Une cellule appartient à un seul projet actif.
2. Un dossier n'est finalisé qu'une fois.
3. Total émis = tampon + net.
4. La part communauté reçue est toujours supérieure ou égale au minimum.
5. Un crédit retiré n'est plus jamais transférable.
6. Un validateur ne peut pas valider son propre projet.

## 9. API et données hors chaîne

**Routes (Next.js route handlers)**

| Route | Rôle | Protection |
|---|---|---|
| `POST /api/evidence/upload` | Contrôles et envoi des preuves en IPFS privé | Signature wallet, limite de débit, validation du fichier |
| `POST /api/reports/analyze` | Appel IA et rapport structuré | Signature wallet, quota par projet |
| `POST /api/reports/anchor` | Ancrage du hash par le service d'ancrage | Réservé au serveur, jamais exposé au client |
| `GET /api/projects` et `/api/projects/[id]` | Lecture projets | Public |
| `GET /api/satellite/[projectId]` | Série NDVI | Public |
| `GET /api/certificates/[txHash]` | Certificat de retrait | Public |

**Tables d'index (si Postgres) :** projets, éléments de preuve (identifiant, projet, CID, réseau, hash, date, cellule, wallet), rapports (CID, hash, score, version du modèle, date), événements indexés.

## 10. Sécurité

### 10.1 Modèle de menaces

| Menace | Impact | Mesure |
|---|---|---|
| Revendication d'une zone déjà prise | Double comptage | Unicité des cellules appliquée par le contrat |
| Fausses photos ou photos réutilisées | Crédits injustifiés | Contrôle EXIF et zone, hash perceptuel, croisement satellite, validation humaine |
| Collusion porteur et validateur | Fraude | Pas d'auto-validation, deux validateurs distincts, transparence des votes, réputation (bonus) |
| Manipulation de l'IA (instructions cachées dans une image ou un texte) | Rapport biaisé | Contenu traité comme donnée non fiable, sortie validée par schéma, IA consultative, vote humain obligatoire |
| Compromission de la clé du service d'ancrage | Faux rapports ancrés | Rôle limité à l'ancrage, rotation de clé, double validation humaine en aval |
| Attaques classiques sur contrats (réentrance, contrôle d'accès, débordement) | Perte de fonds ou d'état | OpenZeppelin, ReentrancyGuard, Pausable, erreurs personnalisées, tests de fuzz et d'invariants |
| Abus de l'API (spam, coûts IA) | Coûts et indisponibilité | Limites de débit, quotas, authentification par signature |
| Fuite de données personnelles | Atteinte à la vie privée | Aucune donnée personnelle on-chain, preuves brutes en IPFS privé |
| Prise de contrôle de l'administration | Détournement des paramètres | Multisig pour l'administration, paramètres bornés dans le contrat |

### 10.2 Contrats
- Bibliothèques éprouvées uniquement ; pas de logique de signature personnalisée.
- Contrôle d'accès par rôles, `Pausable` pour l'urgence, schéma contrôle puis effet puis interaction.
- Boucles bornées, aucune itération non limitée sur un tableau grandissant.
- Analyse statique (Slither), tests unitaires, fuzz et invariants avec Foundry, objectif de couverture élevé.

### 10.3 Application
- Validation de toutes les entrées avec un schéma (zod), côté serveur.
- Clés (IA, Pinata, wallet d'ancrage) uniquement en variables d'environnement serveur, jamais dans le client ni dans le dépôt.
- En-têtes de sécurité et politique de contenu, limitation de débit, journalisation sans données sensibles.
- Contrôle des fichiers envoyés (type réel, taille, nettoyage des métadonnées inutiles).

### 10.4 IA
- Aucun pouvoir de signature ni de décision finale.
- Prompt système fixe, contenus utilisateur encadrés comme données, sortie obligatoire en JSON validé.
- Version du modèle et date enregistrées dans chaque rapport pour la traçabilité.

### 10.5 Données et vie privée

| Donnée | Emplacement |
|---|---|
| Hash des documents | On-chain |
| Rapports finaux, certificats, cellules, séries NDVI | IPFS public |
| Photos brutes des agents | IPFS privé, accès temporaire pour validateurs |
| Identité et contacts des agents | Ni IPFS ni on-chain |

Toute donnée publique doit être considérée comme permanente. Les obligations de protection des données applicables au Bénin sont à vérifier avant un déploiement réel.

### 10.6 Clés et déploiement
- Testnet uniquement pour le hackathon ; aucune clé de valeur réelle.
- Administration derrière un multisig, même sur testnet, pour démontrer le principe.
- Adresses de contrats et vérification du code sur l'explorateur du réseau.

## 11. Exigences non fonctionnelles

- **Utilisable en connexion faible :** PWA, images compressées côté client, chargement progressif.
- **Langues :** français et anglais.
- **Accessibilité :** contrastes suffisants, navigation clavier, textes alternatifs.
- **Coût en gas :** mesuré et documenté pour chaque fonction principale.
- **Disponibilité de la démo :** données pré-calculées pour ne pas dépendre de services externes pendant la vidéo.
- **Maintenabilité :** code TypeScript typé, commentaires utiles, README bilingue.

## 12. Stratégie de tests et qualité

- Contrats : tests unitaires, fuzz et invariants avec Foundry, scénarios de triche (chevauchement, double vote, double retrait, mauvais rôle).
- Application : tests Vitest sur la logique de calcul, les validations et les routes ; test de bout en bout du flux principal si le temps le permet.
- Intégration continue (GitHub Actions) : compilation, tests, Slither, lint.
- Journal des mesures de gas et rapport de couverture inclus dans la documentation.

## 13. Planning (12 au 24 octobre 2026)

Le hackathon se termine le 25 octobre ; on vise une soumission la veille pour garder une marge. Il reste environ 14 jours, donc le périmètre est strict (F1 à F12).

| Dates | Travail |
|---|---|
| 11 et 12 oct | Cadrage, dépôt, outils, `ProjectRegistry` et tests |
| 13 à 15 oct | `Verification`, `CarbonCredit`, `Marketplace`, fuzz et invariants, déploiement testnet |
| 14 à 16 oct | Script satellite et données de démonstration (en parallèle) |
| 16 à 19 oct | Application : carte, preuves, IA, validation, achat, retrait |
| 20 et 21 oct | Tableau de bord, certificat, durcissement sécurité, Slither |
| 22 oct | README bilingue, schéma d'architecture, documentation |
| 23 oct | Vidéo de démonstration (3 à 5 minutes), répétition |
| 24 oct | Soumission sur Devpost, vérifications finales |

Vérifier sur Devpost l'ouverture des inscriptions, l'heure limite exacte et le règlement (pays éligibles).

## 14. Livrables et alignement avec les critères du jury

| Livrable | Contenu |
|---|---|
| Alignement avec la piste | Piste Marchés du carbone et transparence, défi anti double comptage |
| Description du projet | Problème, solution, utilisateurs, passage à l'échelle, adoption |
| Vidéo (3 à 5 min) | Flux complet de l'enregistrement au certificat |
| Dépôt GitHub public | Code, tests, README bilingue, ce document |
| Démo | Application déployée sur testnet |

| Critère du jury | Réponse de BlueRoot |
|---|---|
| Impact climatique | Confiance et accès au financement pour la restauration des mangroves |
| Innovation | Unicité spatiale on-chain, tampon et part communauté codés en dur, preuve à deux sources |
| Exécution technique | Contrats testés, déployés, application complète, mesures de gas |
| Utilité pratique | Cas béninois réel, modèle économique par abonnement MRV et services |
| Présentation | Vidéo claire, schéma, certificat vérifiable |

## 15. Risques et limites

- **Traitement satellite plus long que prévu :** données pré-calculées et un seul recalcul en direct.
- **Délai court :** périmètre strict, fonctionnalités bonus coupées en premier.
- **Valeur scientifique du calcul :** l'indice de végétation ne mesure pas le carbone ; l'unité est donc un hectare-année vérifié, avec des hypothèses affichées.
- **Aspects réglementaires :** cadre carbone et protection des données à valider avec des partenaires locaux.
- **Conditions d'usage des données :** licences et quotas des sources à vérifier.
- **Reconnaissance du marché :** sans standard accrédité, il s'agit de contributions climat vérifiées et non de compensations certifiées.

## 16. Identité visuelle

**Nom : BlueRoot.** Il réunit le carbone bleu (blue carbon) et la racine, double symbole : les racines en échasses des mangroves et la racine de confiance (Merkle root) d'une preuve vérifiable. Disponibilité du nom et de la marque à vérifier avant tout usage commercial.

**Signature :** Chaque racine compte, chaque preuve aussi. (EN : Every root counts, so does every proof.)

**Logo :** un hexagone (la cellule H3 qui découpe le territoire) contenant une mangrove stylisée : couronne de feuillage, tronc et racines arquées descendant vers l'eau. Quatre points dorés aux pointes des racines, reliés par une ligne, représentent les nœuds de la chaîne et les preuves ancrées. Le fichier SVG est fourni séparément.

**Palette :** bleu profond #0B3C5D (océan et confiance), vert mangrove #3FB37F, bleu eau #6EC6E8, or #F2C14E (preuve), blanc cassé #C9E4DE pour les racines.

**Typographie :** une sans-serif géométrique lisible (Inter ou équivalent), titres en gras.

## 17. Annexes

**Glossaire**
- **Carbone bleu :** carbone stocké par les écosystèmes côtiers (mangroves, herbiers).
- **MRV :** mesure, déclaration et vérification.
- **H3 :** système de cellules hexagonales géographiques.
- **NDVI :** indice de végétation calculé à partir d'images satellite.
- **Hectare-année vérifié :** un hectare de mangrove restauré maintenu pendant un an, selon les preuves validées.
- **Réserve tampon :** crédits mis de côté pour couvrir le risque de disparition.

**Sources de données à vérifier avant usage :** imagerie Sentinel-2 (Copernicus Data Space Ecosystem, Sentinel Hub ou Google Earth Engine), jeux de données d'étendue des mangroves (par exemple Global Mangrove Watch), alertes de couvert forestier (Global Forest Watch).
