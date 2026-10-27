// Hauptorte der Nachtkarte (assets/illustrations/nachtkarte-eu.svg) in den Koordinaten des Kartenbilds: flächentreue
// Azimutalprojektion um 12° O, 50° N, Maßstab 1000. Erzeugt aus der freigegebenen Vorschau (Konzept A); nur für
// die Darstellung der Strecke, nicht für Entfernungen oder Preise. [Schlüssel, Name, x, y, Land]
// Wer das Kartenbild neu erzeugt, erzeugt diese Datei mit (gleiche Projektion, gleicher Ausschnitt).
export const KARTE_VB = Object.freeze({"x":-307,"y":-230,"w":536,"h":497});
export const KARTE_ORTE = Object.freeze([
  ["berlin","Berlin",14.9,-44.1,"DE"], ["hamburg","Hamburg",-20.8,-62.2,"DE"], ["muenchen","München",-4.9,32.4,"DE"], ["koeln","Köln",-55.4,-18.3,"DE"],
  ["frankfurt","Frankfurt am Main",-37.1,-2.7,"DE"], ["stuttgart","Stuttgart",-32.4,20.7,"DE"], ["duesseldorf","Düsseldorf",-57.1,-23.5,"DE"], ["leipzig","Leipzig",4,-23.4,"DE"],
  ["dortmund","Dortmund",-49.2,-27.9,"DE"], ["essen","Essen",-54.2,-27.3,"DE"], ["bremen","Bremen",-33.5,-54.5,"DE"], ["dresden","Dresden",19.1,-18.5,"DE"],
  ["hannover","Hannover",-24.2,-41.7,"DE"], ["nuernberg","Nürnberg",-10.4,9.5,"DE"], ["duisburg","Duisburg",-57,-27,"DE"], ["bochum","Bochum",-51.9,-27.5,"DE"],
  ["wuppertal","Wuppertal",-52.9,-23.7,"DE"], ["bielefeld","Bielefeld",-37.3,-36.1,"DE"], ["bonn","Bonn",-54.1,-14.5,"DE"], ["muenster","Münster",-47,-35.6,"DE"],
  ["mannheim","Mannheim",-40,8,"DE"], ["karlsruhe","Karlsruhe",-41.2,16.3,"DE"], ["augsburg","Augsburg",-12.8,28.4,"DE"], ["wiesbaden","Wiesbaden",-42.1,-2.5,"DE"],
  ["aachen","Aachen",-65.3,-16.2,"DE"], ["braunschweig","Braunschweig",-15.8,-39.8,"DE"], ["kiel","Kiel",-19,-75.6,"DE"], ["chemnitz","Chemnitz",10.1,-14.5,"DE"],
  ["halle","Halle (Saale)",-0.3,-25.8,"DE"], ["magdeburg","Magdeburg",-4,-37,"DE"], ["freiburg","Freiburg im Breisgau",-48.6,33.7,"DE"], ["mainz","Mainz",-41.8,-1,"DE"],
  ["luebeck","Lübeck",-13.5,-67.7,"DE"], ["erfurt","Erfurt",-10.7,-17.2,"DE"], ["rostock","Rostock",1,-71.4,"DE"], ["kassel","Kassel",-27.5,-23.3,"DE"],
  ["potsdam","Potsdam",11.4,-41.8,"DE"], ["saarbruecken","Saarbrücken",-57,11.4,"DE"], ["oldenburg","Oldenburg",-39.7,-55.8,"DE"], ["osnabrueck","Osnabrück",-42.2,-40.9,"DE"],
  ["heidelberg","Heidelberg",-37.8,9.6,"DE"], ["darmstadt","Darmstadt",-37.7,1.4,"DE"], ["regensburg","Regensburg",1.1,17.3,"DE"], ["paderborn","Paderborn",-35.1,-30.8,"DE"],
  ["ingolstadt","Ingolstadt",-6.6,21.4,"DE"], ["wuerzburg","Würzburg",-23.1,3.3,"DE"], ["ulm","Ulm",-23.3,27.6,"DE"], ["wolfsburg","Wolfsburg",-12.9,-42.3,"DE"],
  ["heilbronn","Heilbronn",-31.7,14.4,"DE"], ["goettingen","Göttingen",-22.5,-27.2,"DE"], ["pforzheim","Pforzheim",-37.9,18.5,"DE"], ["reutlingen","Reutlingen",-32.3,25.8,"DE"],
  ["koblenz","Koblenz",-49.1,-7.7,"DE"], ["trier","Trier",-60.4,2.2,"DE"], ["jena","Jena",-4.5,-16.2,"DE"], ["cottbus","Cottbus",25.2,-31.1,"DE"],
  ["schwerin","Schwerin",-6.1,-63.4,"DE"], ["flensburg","Flensburg",-25.8,-83.9,"DE"], ["passau","Passau",16.5,24.8,"DE"], ["konstanz","Konstanz",-33.1,40.2,"DE"],
  ["esslingen","Esslingen am Neckar",-31,21.4,"DE"], ["filderstadt","Filderstadt",-32,22.6,"DE"], ["bremerhaven","Bremerhaven",-35.5,-62.8,"DE"], ["wien","Wien",50.8,29.8,"AT"],
  ["graz","Graz",40.9,50.2,"AT"], ["linz","Linz",26.6,29.1,"AT"], ["salzburg","Salzburg",12.2,38.1,"AT"], ["innsbruck","Innsbruck",-7.1,47.6,"AT"],
  ["paris","Paris",-110.5,12.8,"FR"], ["lyon","Lyon",-87.1,69.9,"FR"], ["marseille","Marseille",-84.2,113.2,"FR"], ["toulouse","Toulouse",-133.2,102.4,"FR"],
  ["nice","Nizza",-59.7,108.1,"FR"], ["nantes","Nantes",-159.7,34.1,"FR"], ["strasbourg","Straßburg",-49.1,23.6,"FR"], ["bordeaux","Bordeaux",-155,77.2,"FR"],
  ["lille","Lille",-98.7,-16.9,"FR"], ["rennes","Rennes",-158.4,18.5,"FR"], ["montpellier","Montpellier",-102.5,106,"FR"], ["dijon","Dijon",-82.2,43,"FR"],
  ["reims","Reims",-90.6,8.1,"FR"], ["le-havre","Le Havre",-134.1,-1.8,"FR"], ["amsterdam","Amsterdam",-75.5,-45,"NL"], ["rotterdam","Rotterdam",-80.8,-37.6,"NL"],
  ["den-haag","Den Haag",-82.4,-40.6,"NL"], ["utrecht","Utrecht",-73.7,-39.9,"NL"], ["eindhoven","Eindhoven",-70.9,-28.2,"NL"], ["groningen","Groningen",-56.7,-58.3,"NL"],
  ["bruessel","Brüssel",-84.1,-19.2,"BE"], ["antwerpen","Antwerpen",-82.9,-25.5,"BE"], ["gent","Gent",-90.6,-23.4,"BE"], ["luettich","Lüttich",-71.1,-14.1,"BE"],
  ["luxemburg","Luxemburg",-66.3,4.2,"LU"], ["kopenhagen","Kopenhagen",5.6,-99.1,"DK"], ["aarhus","Aarhus",-17.5,-107.7,"DK"], ["odense","Odense",-16,-94.4,"DK"],
  ["aalborg","Aalborg",-19.8,-123.3,"DK"], ["stockholm","Stockholm",54.1,-164.9,"SE"], ["goeteborg","Göteborg",-0.3,-134.5,"SE"], ["malmoe","Malmö",9.9,-97.8,"SE"],
  ["uppsala","Uppsala",49.5,-173.8,"SE"], ["helsinki","Helsinki",112.1,-187.4,"FI"], ["tampere","Tampere",97.9,-208.4,"FI"], ["turku","Turku",88.4,-188.5,"FI"],
  ["tallinn","Tallinn",112.8,-174.6,"EE"], ["tartu","Tartu",133.9,-159.8,"EE"], ["riga","Riga",114.8,-130.8,"LV"], ["vilnius","Vilnius",133.2,-93.9,"LT"],
  ["kaunas","Kaunas",118.9,-95.2,"LT"], ["warschau","Warschau",96.1,-44.8,"PL"], ["krakau","Krakau",88.8,-5.8,"PL"], ["lodz","Łódź",80.4,-34.8,"PL"],
  ["breslau","Breslau",55.2,-21.2,"PL"], ["posen","Posen",52.5,-43.8,"PL"], ["danzig","Danzig",67.6,-79,"PL"], ["stettin","Stettin",26.5,-60.3,"PL"],
  ["kattowitz","Kattowitz",78.2,-8.2,"PL"], ["lublin","Lublin",115,-30,"PL"], ["bialystok","Białystok",116.4,-63.4,"PL"], ["prag","Prag",27.3,-1.8,"CZ"],
  ["bruenn","Brünn",52.5,12.3,"CZ"], ["ostrau","Ostrau",70.4,0.2,"CZ"], ["pilsen","Pilsen",15.6,4.2,"CZ"], ["bratislava","Bratislava",59.5,30.3,"SK"],
  ["kosice","Košice",106.3,15.8,"SK"], ["budapest","Budapest",82.9,39.8,"HU"], ["debrecen","Debrecen",113.2,35.9,"HU"], ["szeged","Szeged",98.2,60.2,"HU"],
  ["pecs","Pécs",75.4,65.5,"HU"], ["ljubljana","Ljubljana",30.4,68.2,"SI"], ["maribor","Maribor",43.8,59.1,"SI"], ["zagreb","Zagreb",48.4,71.8,"HR"],
  ["split","Split",56.3,111.6,"HR"], ["rijeka","Rijeka",30,81,"HR"], ["osijek","Osijek",81.7,74,"HR"], ["rom","Rom",6.5,141.2,"IT"],
  ["mailand","Mailand",-34.4,78.6,"IT"], ["neapel","Neapel",30.1,159.1,"IT"], ["turin","Turin",-53.1,84.5,"IT"], ["palermo","Palermo",18.8,206.8,"IT"],
  ["genua","Genua",-38.3,96.8,"IT"], ["bologna","Bologna",-8.2,96.1,"IT"], ["florenz","Florenz",-9.3,108.6,"IT"], ["bari","Bari",64.2,152.8,"IT"],
  ["venedig","Venedig",3.9,79.6,"IT"], ["verona","Verona",-12.4,79.5,"IT"], ["catania","Catania",43,216.9,"IT"], ["cagliari","Cagliari",-39.1,187.1,"IT"],
  ["triest","Triest",21.7,75.6,"IT"], ["bozen","Bozen",-7.8,61,"IT"], ["madrid","Madrid",-207.7,145.8,"ES"], ["barcelona","Barcelona",-128.7,141.9,"ES"],
  ["valencia","Valencia",-166.7,170.2,"ES"], ["sevilla","Sevilla",-248.3,190.9,"ES"], ["saragossa","Saragossa",-167.6,131.5,"ES"], ["malaga","Málaga",-229.3,207.2,"ES"],
  ["bilbao","Bilbao",-188.7,99.1,"ES"], ["palma","Palma",-126,174.2,"ES"], ["valladolid","Valladolid",-216.7,122,"ES"], ["vigo","Vigo",-264.6,99.3,"ES"],
  ["murcia","Murcia",-180.6,194,"ES"], ["a-coruna","A Coruña",-255.9,81.4,"ES"], ["lissabon","Lissabon",-285.2,157.5,"PT"], ["porto","Porto",-267.9,118.2,"PT"],
  ["braga","Braga",-264,112,"PT"], ["faro","Faro",-276.1,190.7,"PT"], ["coimbra","Coimbra",-269.7,134.8,"PT"], ["athen","Athen",161.6,197.3,"GR"],
  ["thessaloniki","Thessaloniki",144.8,152.9,"GR"], ["patras","Patras",133.7,196.4,"GR"], ["heraklion","Heraklion",187.5,239.5,"GR"], ["sofia","Sofia",144.9,116.6,"BG"],
  ["plovdiv","Plowdiw",164.5,123.4,"BG"], ["varna","Warna",201.1,97.5,"BG"], ["burgas","Burgas",197.9,110.8,"BG"], ["bukarest","Bukarest",174.8,81,"RO"],
  ["cluj","Cluj-Napoca",138,45.8,"RO"], ["timisoara","Timișoara",112.1,67.2,"RO"], ["iasi","Iași",183.5,30.5,"RO"], ["constanta","Constanța",206.8,78.9,"RO"],
  ["brasov","Brașov",165.1,60.9,"RO"], ["dublin","Dublin",-188,-81.9,"IE"], ["cork","Cork",-217.2,-63.4,"IE"], ["galway","Galway",-216.3,-88.2,"IE"],
  ["limerick","Limerick",-215.1,-76.7,"IE"], ["valletta","Valletta",35.7,244.9,"MT"],
]);
// Hauptstadt je Land: Rückfall, wenn der Ort nicht bekannt ist (ohne Namen auf der Karte).
export const KARTE_HAUPTSTADT = Object.freeze({"DE":"berlin","AT":"wien","BE":"bruessel","BG":"sofia","DK":"kopenhagen","EE":"tallinn","FI":"helsinki","FR":"paris","GR":"athen","IE":"dublin","IT":"rom","HR":"zagreb","LV":"riga","LT":"vilnius","LU":"luxemburg","MT":"valletta","NL":"amsterdam","PL":"warschau","PT":"lissabon","RO":"bukarest","SE":"stockholm","SK":"bratislava","SI":"ljubljana","ES":"madrid","CZ":"prag","HU":"budapest","CY":"athen"});
// Leitzone der deutschen Postleitzahl (erste Ziffer) → Ort in der Zone (ohne Namen auf der Karte).
export const KARTE_ZONE = Object.freeze(["dresden","berlin","hamburg","hannover","dortmund","koeln","frankfurt","stuttgart","muenchen","nuernberg"]);
// Gebräuchliche Schreibweisen → Schlüssel.
export const KARTE_ALIAS = Object.freeze({"frankfurt":"frankfurt","frankfurt a. m.":"frankfurt","munich":"muenchen","cologne":"koeln","vienna":"wien","wien":"wien","milano":"mailand","milan":"mailand","roma":"rom","praha":"prag","warszawa":"warschau","krakow":"krakau","wroclaw":"breslau","poznan":"posen","gdansk":"danzig","szczecin":"stettin","brussel":"bruessel","bruxelles":"bruessel","brussels":"bruessel","kobenhavn":"kopenhagen","copenhagen":"kopenhagen","lisboa":"lissabon","athina":"athen","athens":"athen","bucuresti":"bukarest","napoli":"neapel","torino":"turin","firenze":"florenz","venezia":"venedig","genova":"genua","goteborg":"goeteborg","malmo":"malmoe","den haag":"den-haag","s-gravenhage":"den-haag","liege":"luettich","luxembourg":"luxemburg","strasbourg":"strasbourg","nizza":"nice","zaragoza":"saragossa","brno":"bruenn","ostrava":"ostrau","plzen":"pilsen","esslingen":"esslingen"});
