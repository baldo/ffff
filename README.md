ffff
====

wenn du dieses script laufen lassen willst sind folgende Schritte notwendig:

 - node.js und npm installieren
 - im Hauptverzeichnis: 

    npm install

dies erzeugt den Ordner node_modules

in der Datei server.js kann man den config-Bereich anpassen, vor allem den peersPath, (da dieser per default im /tmp ordner liegt)



starten mit

    node server.js
    
am besten als daemon laufen lassen mit startup-script


Aufbau
====

Alles im ordner /static/ wird direkt unter / im erreichbaren server-root-pfad ausgeliefert

weiteres ist im server.js recht lesbar im programmcode erkennbar
