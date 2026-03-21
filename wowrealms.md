Nutze folgende BattleNet API um die Connected Realm zu bekommen:

Zulässige Regions: eu, us

Version;Namespace
Classic; dynamic-classic1x-{region}
MoP; dynamic-classic-{region}
TBC; dynamic-classicann-{region}

API Aufruf:
https://{region}.api.blizzard.com/data/wow/connected-realm/4440?namespace={namespace}&orderby=id&_page=1



Diese Realms sollen in der Datenbank gespeichert werden mit den folgenden Feldern:
- id
- realmId
- name
- slug
- region
- namespace
- Version
- type
- createdAt
- updatedAt

Aktualisiere bei Bedarf das DB Schema.

beachte, dass die Namen multilingual sind und daher in der Datenbank als JSON gespeichert werden müssen.

Füge intern eine Funktion hinzu, die die Namen in die Datenbank speichert und bei bedarf ausgeführt werden kann um die Liste zu aktualisieren.