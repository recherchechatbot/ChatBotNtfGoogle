'use strict';

const express = require('express');
const JSONbig = require('json-bigint');
const request = require('request');
const DialogflowApp = require('actions-on-google').DialogflowApp; 
const REST_PORT = (process.env.PORT || 5000);
const bodyParser = require('body-parser');
const myApp = express();

//Memoire de la derniere recherche
var arrayProducts = [];//array qui contient les strings qu'on veut renvoyer'
var arrayProductsFull = [];//[[libelle, id, stock],...]
var productIndex = 0;//Savoir où on est dans array products
var actualProduct = [];//produit actuel
var indicateurOutOfStock = 0;//indicateur séparateur de l'intent de confirmation de produit'
//Config vars, TODO à cacher plus tard
const MCO_URL = process.env.MCO_URL;
const RC_URL = process.env.RC_URL;
const FO_URL = process.env.FO_URL;
const MSQ_APP_RC = process.env.MSQ_APP_RC;
const MSQ_JETON_APP_RC = process.env.MSQ_JETON_APP_RC;
//Vars authentification
var email = "";
var mdp = "";
var myToken = "";
var ASPSessionId = "";
var userInfos = {};
var myIdCreneau = 0;
var responseChoixCreneau = {};

myApp.use(bodyParser.text({ type: 'application/json' }));

myApp.post('/login', function (req, res) {
    var resultat = JSONbig.parse(req.body);
    console.log("VALEUR DE BODY : " + JSON.stringify(req.body));
    var authCode = null;
    loginRC(resultat.email, resultat.mdp)
        .then((rep) => {
            if (rep.id) {
                loginMCommerce(resultat.email, resultat.mdp, rep.id)
                    .then((r) => {
                        if (r.TokenAuthentification) {
                            email = resultat.email;
                            myToken = r.TokenAuthentification;
                            console.log("le token a bien été récupéré");
                            const redirectURISuccess = `${resultat.redirectURI}#access_token=${myToken}&token_type=bearer&state=${resultat.state}`;
                            getAspNetSessionId(resultat.email, resultat.mdp)
                                .then((c) => {
                                    ASPSessionId = c["ASP.NET_SessionId"]
                                })
                                .catch(err => {
                                    console.log("impossible de recuperer session id ASP");
                                });
                            getMcoUserInfo(myToken)
                                .then((u) => {
                                    userInfos = u;
                                })
                                .catch(err => {
                                    console.log("impossible de récupérer idpdvfavori, erreur suivante: " + err);
                                });
                            return res.json({
                                EstEnErreur: false,
                                urlRedirection: redirectURISuccess
                            });
                        }
                        else {
                            console.log("le token n'a pas été récupéré mais la réponse est ok");
                            return res.json({
                                EstEnErreur: true,
                                urlRedirection: ""
                            });
                        }
                    })
            }
            else {
                console.log("Impossible de récuperer l'idRC");
                return res.json({
                    EstEnErreur: true,
                    urlRedirection: ""
                });
            }
        })
        .catch(err => {
            return res.json({
                EstEnErreur: true,
                urlRedirection: ""
            });
        });
});
myApp.set('view engine', 'ejs');
myApp.get('/authorize', function (req, res) {
    var accountLinkingToken = req.query.account_linking_token;
    var redirectURI = req.query.redirect_uri;
    var state = req.query.state;
    res.render('authorize', {
        accountLinkingToken: accountLinkingToken,
        redirectURI: redirectURI,
        state: state
    });
});

myApp.post('/webhook', (request, response) => {
    var body = JSON.parse(request.body);
    if (body) {
        processV1Request(request, response);
    } else {
        console.log('Invalid Request');
        return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
    }
});
//Login referentiel client, permet de récupérer idRc'
function loginRC(email, mdp) {
    console.log("Email : " + email);
    console.log("Mdp : " + mdp);
    return new Promise((resolve, reject) => {
        request({
            url: RC_URL + 'ReferentielClient/v1/login',
            method: 'POST',
            body: {
                email: email,
                mdp: mdp
            },
            headers: {
                "Msq-Jeton-App": MSQ_JETON_APP_RC,
                "Msq-App": MSQ_APP_RC
            },
            json: true
        }, (error, response) => {
            if (error) {
                console.log('Erreur login Referentiel Client: ', error);
                reject(error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
                reject(new Error(response.body.error));
            }
            resolve(response.body);
        });
    });
}
//Recuperation cookie ASP session ID
function getAspNetSessionId(email, mdp) {
    var options = {
        method: 'POST',
        uri: FO_URL + "Connexion",
        body: {
            txtEmail: email,
            txtMotDePasse: mdp,
            largeur: "800",
            hauteur: "300",
            resteConnecte: true,
        },
        json: true,
        headers: {
            referer: 'http://google.fr'
        }
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                console.log("getAspNetSessionId retourne : " + response.headers['set-cookie']);
                resolve(parseCookies(response.headers['set-cookie'].toString()));
            }
            else {
                console.log("getAspNetSessionId ERREUR" + error);
                reject(error);
            }
        })
    });
}
//Recuperation token d'authentification 
function loginMCommerce(email, mdp, idrc) {
    console.log("Email : " + email);
    console.log("Mdp : " + mdp);
    return new Promise((resolve, reject) => {
        request({
            url: MCO_URL + 'api/v1/loginRc',
            method: 'POST',
            body: {
                email: email,
                motdepasse: mdp,
                idrc: idrc,
                veutcartefid: false
            },
            json: true
        }, (error, response) => {
            if (error) {
                console.log('Erreur login mcommerce: ', error);
                reject(error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
                reject(new Error(response.body.error));
            }
            resolve(response.body);
        });
    });
}
//Recherche recette sur mcommerce (too long pour l'instant pour dialogflow')
function getRecette(product, token) {
    let url = "https://wsmcommerce.intermarche.com/api/v1/recherche/recette?mot=" + product;
    console.log("URRRRLL:" + url);
    var options = {
        method: 'GET',
        uri: url,
        headers: {
            'TokenAuthentification': token
        }
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statuscode == 200) {
                resolve(response.body);
            }
            else {
                reject(error);
            }
        });
    }
    );
}
//Recherche produit
function getProduit(produit, idPdv, c) {
    console.log("produit = " + produit);
    var options = {
        method: 'POST',
        uri: "https://drive.intermarche.com/RechercheJs",
        headers: {
            Cookie: c,
        },
        body: {
            mot: produit
        },
        json: true
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                resolve(response.body);
            }
            else {
                console.log("ON FAIT UN REJECT");
                reject(error);
            }
        })
    })
}
//Recuperation infos utilisateur (nom, prenom, id pdv favori etc...)
function getMcoUserInfo(token) {
    var options = {
        method: 'GET',
        uri: MCO_URL + "api/v1/clientRc",
        headers: {
            'TokenAuthentification': token
        },
        json: true
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                resolve(response.body);
            } else {
                console.log('Error while getting Mco user info: ' + error);
                reject(error);
            }
        });
    })
}
//Recuperation nom pdv quand on a juste son id
function getNamePdv(idPdv) {
    var options = {
        method: 'GET',
        uri: MCO_URL + "api/v1/pdv/fiche/" + idPdv,
        json: true
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                resolve(response.body);
            } else {
                console.log('Error while getting name PDV: ' + error);
                reject(error);
            }
        });
    })
}
//Parse les cookies pour les avoir dans un format utilisable
function parseCookies(cookiesString) {
    var list = {};
    cookiesString && cookiesString.split(';').forEach(function (c1) {
        c1 && c1.split(',').forEach(function (cookie) {
            var parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    });
    return list;
}
//Ajout panier
function addProductBasketFront(idProduit, cookie) {
    return new Promise((resolve, reject) => {
        request({
            url: FO_URL + 'Plus',
            method: 'POST',
            body: {
                "idProduit": idProduit,
                "trackingCode": null,
                "idSource": null,
                "idUniversProduitComplementaire": null
            },
            headers: {
                'cookie': cookie
            },
            json: true
        }, (error, response) => {
            if (error) {
                console.log('Erreur lors de l\'ajout du panier : ', error);
                reject(error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
                reject(new Error(response.body.error));
            }
            resolve(response.body);
        });
    });
}
//Hit le front, obligatoire avant toute fonction qui recupere un cookie
function hitFO(cookie) {
    return new Promise((resolve, reject) => {
        request({
            url: FO_URL,
            method: 'GET',
            headers: {
                'cookie': cookie
            }
        }, (error, response) => {
            if (error) {
                reject(error);
            } else if (response.body.error) {
                reject(new Error(response.body.error));
            }
            resolve();
        });
    });
}
//Recuperation créneaux livraison
function getCreneaux(tok) {
    var options = {
        method: 'GET',
        uri: MCO_URL + "api/v1/pdv/creneaux",
        headers: {
            'TokenAuthentification': tok
        },
        json: true
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                console.log('reponse creneaux' + response.body);
                resolve(response.body);
            } else {
                console.log('Error while getting creneaux ' + error);
                reject(error);
            }
        });
    })
}

function getMonth(n) {
    var x = "";
    if (n === 1) {
        x = "Janvier";
    }
    else if (n === 2) {
        x === "F\u00E9vrier";
    }
    else if (n === 3) {
        x === "Mars";
    }
    else if (n === 4) {
        x === "Avril";
    }
    else if (n === 5) {
        x === "Mai";
    }
    else if (n === 6) {
        x === "Juin";
    }
    else if (n === 7) {
        x === "Juillet";
    }
    else if (n === 8) {
        x === "Ao\u00FBt";
    }
    else if (n === 9) {
        x === "Septembre";
    }
    else if (n === 10) {
        x === "Octobre";
    }
    else if (n === 11) {
        x === "Novembre";
    }
    else if (n === 12) {
        x === "D\u00E9cembre";
    }

    return x;
}
//Recapitulatif panier
function getRecapPanier(c) {
    var options = {
        method: 'POST',
        uri: FO_URL + "AfficherPanier",
        headers: {
            cookie: c
        }
    };

    return new Promise((resolve, reject) => {
        console.log("on passe ça dans le request: " + JSON.stringify(options));
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                console.log("On est dans le promise, et ya pas d'erreur");
                resolve(response.body);
            }
            else {
                reject(error);
            }
        })
    });
}
//Vider panier
function emptyBasket(token) {
    let options = {
        method: "DELETE",
        uri: MCO_URL + "api/v1/client/panier",
        headers: {
            "TokenAuthentification": token
        },
        json: true
    }
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                console.log("à priori le panier devrait être vidé");
                resolve(response.body);//A priori pas necessaire car pas juste "null" dans le body en cas de success
            } else {
                console.log("Il y a eu un problème lors du vidage du panier");
                reject(error);
            }
        })
    })
}

/*
* Function to handle v1 webhook requests from Dialogflow
*/
function processV1Request(request, response) {
    var body = JSON.parse(request.body);
    let action = body.result.action; // https://dialogflow.com/docs/actions-and-parameters
    let parameters = body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters
    let inputContexts = body.result.contexts; // https://dialogflow.com/docs/contexts
    let requestSource = (body.originalRequest) ? body.originalRequest.source : undefined;
    const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests
    const app = new DialogflowApp({ request: request, response: response });
    console.log("ou laaaaaaaaaaaaaaaaa:" + app);
    console.log("ICIIIIIIIIIIIIIIII: " + app.ask);
    // Create handlers for Dialogflow actions as well as a 'default' handler
    const actionHandlers = {
        // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
        'input.welcome': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse('Salut ' + userInfos.AdresseDeFacturation.Prenom + '! Je suis Jacques Bobin ton assistant intermarch\u00E9. Demande moi ce que je sais faire!'); // Send simple response to user
            } else {
                sendResponse('Salut ' + userInfos.AdresseDeFacturation.Prenom + '! Je suis Jacques Bobin ton conseiller intermarch\u00E9. Demande moi ce que je sais faire!');
            }
        },
        // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
        'input.unknown': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
            } else {
                sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
            }
        },
        'recherche.recette': () => {
            let myText = 'Voici quelques recettes pour toi: ';
            console.log("myText:" + myText);
            getRecette('poulet', myToken)
                .then((r) => {
                    console.log("Resultat de la requete http des recettes: " + r);
                    let listeRecettes = JSON.parse(r);
                    let len = listeRecettes.Recettes.length;
                    for (var i = 0; i < len; i++) {
                        myText = myText + listeRecettes.Recettes[i].Titre + ' ';
                    }
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse(myText);
                    } else {
                        sendResponse(myText);
                    }
                })
                .catch((err) => {
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse("Je n'ai pas r\u00E9ussi à trouver des r\u00E9sultats pour ta recherche, v\u00E9rifie que tu es bien connect\u00E9 sur ton compte");
                    } else {
                        sendResponse("Je n'ai pas r\u00E9ussi à trouver des r\u00E9sultats pour ta recherche, v\u00E9rifie que tu es bien connect\u00E9 sur ton compte");
                    }
                    console.log("ERREUR:" + err);
                })
        },
        'recherche.produit': () => {
            productIndex = 0;
            let myProduct = parameters.Nourriture;
            let myIdPdv = 1;
            let cookie = 'ASP.NET_SessionId=' + ASPSessionId + ';IdPdv=' + myIdPdv;
            getProduit(myProduct, myIdPdv, cookie)
                .then((r) => {
                    arrayProducts = [];
                    arrayProductsFull = [];
                    var myText = "Je peux te proposer: ";
                    for (var i = 0; i < r.length; i++) {
                        if (r[i].StockEpuise == false) {
                            arrayProducts.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                            arrayProductsFull.push([r[i].Libelle, r[i].IdProduit, r[i].Stock]);
                        }
                    }
                    sayProducts(myText);
                })
                .catch((err) => {
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse("Je n\'ai pas r\u00E9ussi \u00E0 trouver de r\u00E9sultats pour ta recherche, v\u00E9rifie que tu es bien connect\u00E9 sur ton compte");
                    } else {
                        sendResponse("Je n\'ai pas r\u00E9ussi \u00E0 trouver de r\u00E9sultats pour ta recherche, v\u00E9rifie que tu es bien connect\u00E9 sur ton compte");
                    }
                    console.log("ERREUR:" + err);
                })
        },
        'repeat.produit': () => {
            repeatProducts();
        },
        'next.produit': () => {
            nextProducts();
        },
        'previous.produit': () => {
            previousProducts();
        },
        'choix.produit': () => {
            console.log("my parameter number: " + parameters.number);
            let myChoice = 0;
            if (parameters.number >= 1) {
                myChoice = parameters.number;
            } else {
                myChoice = -1;
            }
            selectProduct(myChoice);
        },
        'choix.quantite.produit': () => {
            let myNumber = parameters.number;
            var cookieSession = 'ASP.NET_SessionId=' + ASPSessionId;
            if (actualProduct[2] > myNumber) {
                indicateurOutOfStock = 0;
                for (var i = 0; i < myNumber; i++) {
                    hitFO(cookieSession)
                        .then(() => {
                            addProductBasketFront(actualProduct[1], cookieSession)
                                .then((r) => {
                                    if (requestSource === googleAssistantRequest) {
                                        sendGoogleResponse('\u00C7a marche, j\'ai ajout\u00E9 ' + myNumber + ' ' + actualProduct[0] + ' \u00E0 ton panier');
                                    } else {
                                        sendResponse('\u00C7a marche, j\'ai ajout\u00E9 ' + myNumber + ' ' + actualProduct[0] + ' \u00E0 ton panier');
                                    }
                                })
                        })
                }
            } 
            else {
                indicateurOutOfStock = 1;
                if (requestSource === googleAssistantRequest) {
                    sendGoogleResponse('Désolé il ne me reste que ' + actualProduct[2] + ' ' + actualProduct[0] + ' en stock, combien en veux-tu?');
                } else {
                    sendResponse('Désolé il ne me reste que ' + actualProduct[2] + ' ' + actualProduct[0] + ' en stock, combien en veux-tu?');
                }
            }
        },
        'choix.quantite.produit.outofstock': () => {
            if (indicateurOutOfStock < 1) {
                if (requestSource === googleAssistantRequest) {
                    sendGoogleResponse("Ne t\'inquiète pas c'est déjà fait. As-tu besoin de quelque chose d'autre?");
                } else {
                    sendResponse("Ne t\'inquiète pas c'est déjà fait. As-tu besoin de quelque chose d'autre?");
                }
            } else {
            let myNumber = parameters.number;
            var cookieSession = 'ASP.NET_SessionId=' + ASPSessionId;
                indicateurOutOfStock = 0;
                for (var i = 0; i < myNumber; i++) {
                    hitFO(cookieSession)
                        .then(() => {
                            addProductBasketFront(actualProduct[1], cookieSession)
                                .then((r) => {
                                    if (requestSource === googleAssistantRequest) {
                                        sendGoogleResponse('\u00C7a marche, j\'ai ajout\u00E9 ' + myNumber + ' ' + actualProduct[0] + ' \u00E0 ton panier');
                                    } else {
                                        sendResponse('\u00C7a marche, j\'ai ajout\u00E9 ' + myNumber + ' ' + actualProduct[0] + ' \u00E0 ton panier');
                                    }
                                })
                        })
                }
            }
        },
        'horaires.pdv': () => {
            console.log("MYUSER INFOS:" + userInfos);
            var nomFamille = userInfos.AdresseDeFacturation.Nom;
            var prenom = userInfos.AdresseDeFacturation.Prenom;
            var idPdvFavori = userInfos.IdPdv;
            var sexe = "";
            if (userInfos.AdresseDeFacturation.IdCivilite == 1) {
                sexe = "Monsieur";
            }
            else {
                sexe = "Madame"
            }
            getNamePdv(idPdvFavori)
                .then((fichePdv) => {
                    if (fichePdv.Site && fichePdv.HorairesLundi && fichePdv.HorairesDimanche) {
                        console.log("on est dans le if youpi");
                        var horairesSemaine = fichePdv.HorairesLundi.replace(/\;/g, "");
                        console.log("horaires semaine avec le regex: " + horairesSemaine);
                        var horairesSemaineOuverture = horairesSemaine.slice(0, 5);
                        var horairesSemaineFermeture = horairesSemaine.slice(-5);//TODO PEUT ETRE SEPARER LE SAMEDI?
                        console.log("On vient de défnir les horaires de la semaine: " + horairesSemaineOuverture + " a " + horairesSemaineFermeture);
                        var horairesDim = fichePdv.HorairesLundi.replace(/\;/g, "");
                        var horairesDimOuverture = horairesDim.slice(0, 5);
                        var horairesDimFermeture = horairesDim.slice(-5);
                        var namePdvFavori = fichePdv.Site;
                        if (requestSource === googleAssistantRequest) {
                            sendGoogleResponse(sexe + ' ' + nomFamille + ', ' + 'votre magasin situ\u00E9 \u00E0 ' + namePdvFavori + ' est ouvert du Lundi au Samedi de ' + horairesSemaineOuverture + " a " + horairesSemaineFermeture + ' et le Dimanche de ' + horairesDimOuverture + " a " + horairesDimFermeture);
                        } else {
                            sendResponse(sexe + ' ' + nomFamille + ', ' + 'votre magasin situ\u00E9 \u00E0 ' + namePdvFavori + ' est ouvert du Lundi au Samedi de ' + horairesSemaineOuverture + " a " + horairesSemaineFermeture + ' et le Dimanche de ' + horairesDimOuverture + " a " + horairesDimFermeture);
                        }
                    }
                })
                .catch(err => {
                    console.log("Impossible de recuperer le nom du PDV");
                })
        },
        'choix.creneau': () => {
            getCreneaux(myToken)
                .then((responseChoixCreneau) => {
                    if (responseChoixCreneau) {
                        if (parameters.date && parameters.time) {
                            let heure = parameters.time.slice(0, -3);//Met heure de type 00:00:00 en format 00h00
                            heure = parseFloat(heure);
                            let leni = responseChoixCreneau.Drive.CreneauxSemaine.length;
                            for (var i = 0; i < leni; i++) {
                                let lenj = responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires.length;
                                let truncHeureFin = parseFloat(responseChoixCreneau.Drive.CreneauxSemaine[i].HeureFin);
                                if (truncHeureFin == heure) {
                                    for (var j = 0; j < lenj; j++) {
                                        let dateCreneau = responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires[j].DateCreneau;
                                        if (dateCreneau.startsWith(parameters.date)) {
                                            if (responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires[j].Statut === "Disponible") {
                                                myIdCreneau = responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires[j].IdCreneau;
                                                if (requestSource === googleAssistantRequest) {
                                                    sendGoogleResponse("C'est not\u00E9, tu pourras donc aller chercher ta commande le " + dateCreneau.slice(8, 10) + " " + getMonth(dateCreneau.slice(5, 7)) + " entre " + responseChoixCreneau.Drive.CreneauxSemaine[i].HeureDebut + " et " + responseChoixCreneau.Drive.CreneauxSemaine[i].HeureFin);//TODO annulation & recap date et heure
                                                } else {
                                                    sendResponse("C'est not\u00E9, tu pourras donc aller chercher ta commande \u00E0 ce moment l\u00E0");
                                                }
                                            } else {
                                                if (requestSource === googleAssistantRequest) {
                                                    sendGoogleResponse("Malheureusement " + userInfos.AdresseDeFacturation.Prenom + ", ton cr\u00E9neau n'est pas disponible, je te prie donc d'en choisir un autre");//TODO annulation & recap date et heure
                                                } else {
                                                    sendResponseFollowUp("Malheureusement " + userInfos.AdresseDeFacturation.Prenom + ", ton cr\u00E9neau n'est pas disponible, je te prie donc d'en choisir un autre");
                                                }
                                            }
                                        } else {
                                            console.log("ERREUR COMPARAISON DE DATE");
                                        }
                                    }
                                } else {
                                    console.log("ERREUR COMPARAISON DHEURE");
                                }
                            }
                        }
                    }
                    else {
                        if (requestSource === googleAssistantRequest) {
                            sendGoogleResponse("Oups, je n'ai pas r\u00E9ussi");//TODO annulation & recap date et heure
                        } else {
                            sendResponseFollowUp("Oups, je n'ai pas r\u00E9ussi");
                        }
                    }
                })
            //TO DO, séparer si l'utilisateur met seulement un jour ou seulement une heure'

        },
        'montant.panier': () => {
            var cookieSession = 'ASP.NET_SessionId=' + ASPSessionId;
            hitFO(cookieSession)
                .then(() => {
                    getRecapPanier(cookieSession)
                        .then((res) => {
                            let resParsed = JSON.parse(res);
                            if (requestSource === googleAssistantRequest) {
                                sendGoogleResponse("Le montant total de ton panier s\'\u00E9l\u00E8ve \u00E0 " + resParsed.Total);
                            } else {
                                sendResponse("Le montant total de ton panier s\'\u00E9l\u00E8ve \u00E0 " + resParsed.Total);
                            }

                        })
                })
        },

        'vider.panier.confirmation': () => {
            emptyBasket(myToken)
                .then((r) => {
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse("Le panier a bien été vidé");
                    } else {
                        sendResponse("Le panier a bien été vidé");
                    }
                })
        },
        'goodbye': () => {
            console.log("dans le bon action");
            if (requestSource === googleAssistantRequest) {
                endGoogleSession("Au revoir " + userInfos.AdresseDeFacturation.Prenom + ", à bientôt !");
                console.log("dans google");
            } else {
                sendResponse("Au revoir " + userInfos.AdresseDeFacturation.Prenom + ", à bientôt !");
                console.log("pas dans google");
            }
        },
        // Default handler for unknown or undefined actions
        'default': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            if (requestSource === googleAssistantRequest) {
                let responseToUser = {
                    //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
                    //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
                    speech: 'This message is from Dialogflow\'s Cloud Functions for Firebase editor!', // spoken response
                    text: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
                };
                sendGoogleResponse(responseToUser);
            } else {
                let responseToUser = {
                    //data: richResponsesV1, // Optional, uncomment to enable
                    //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
                    speech: 'This message is from Dialogflow\'s Cloud Functions for Firebase editor!', // spoken response
                    text: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
                };
                sendResponse(responseToUser);
            }
        }
    };
    // If undefined or unknown action use the default handler
    if (!actionHandlers[action]) {
        action = 'default';
    }
    // Run the proper handler function to handle the request from Dialogflow
    actionHandlers[action]();
    // Function to send correctly formatted Google Assistant responses to Dialogflow which are then sent to the user
    function sendGoogleResponse(responseToUser) {
        if (typeof responseToUser === 'string') {
            app.ask(responseToUser); // Google Assistant response
        } else {
            // If speech or displayText is defined use it to respond
            let googleResponse = app.buildRichResponse().addSimpleResponse({
                speech: responseToUser.speech || responseToUser.displayText,
                displayText: responseToUser.displayText || responseToUser.speech
            });
            // Optional: Overwrite previous response with rich response
            if (responseToUser.googleRichResponse) {
                googleResponse = responseToUser.googleRichResponse;
            }
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            if (responseToUser.googleOutputContexts) {
                app.setContext(...responseToUser.googleOutputContexts);
            }
            console.log('Response to Dialogflow (AoG): ' + JSON.stringify(googleResponse));
            app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
        }
    }
    function endGoogleSession(responseToUser) {
        if (typeof responseToUser === 'string') {
            console.log("on est au bon endroit");
            let googleResponse = {}
            googleResponse.speech = responseToUser;
            googleResponse.displayText = responseToUser;
            googleResponse.data = {};
            googleResponse.data.google = {};
            googleResponse.data.google.expect_user_response = false;
            
            console.log("le json qu'on envoie :" + googleResponse);
            app.ask(googleResponse);    
        } else {
            // If speech or displayText is defined use it to respond
            let googleResponse = app.buildRichResponse().addSimpleResponse({
                speech: responseToUser.speech || responseToUser.displayText,
                displayText: responseToUser.displayText || responseToUser.speech,
                data: {
                    google: {
                        expect_user_response: false
                    }
                }
            });
            // Optional: Overwrite previous response with rich response
            if (responseToUser.googleRichResponse) {
                googleResponse = responseToUser.googleRichResponse;
            }
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            if (responseToUser.googleOutputContexts) {
                app.setContext(...responseToUser.googleOutputContexts);
            }
            console.log('Response to Dialogflow (AoG): ' + JSON.stringify(googleResponse));
            app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
        }
    }
    // Function to send correctly formatted responses to Dialogflow which are then sent to the user
    function sendResponse(responseToUser) {
        // if the response is a string send it as a response to the user
        if (typeof responseToUser === 'string') {
            let responseJson = {};
            responseJson.speech = responseToUser; // spoken response
            responseJson.displayText = responseToUser; // displayed response
            response.json(responseJson); // Send response to Dialogflow
        } else {
            // If the response to the user includes rich responses or contexts send them to Dialogflow
            let responseJson = {};
            // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
            responseJson.speech = responseToUser.speech || responseToUser.displayText;
            responseJson.displayText = responseToUser.displayText || responseToUser.speech;
            // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
            responseJson.data = responseToUser.data;
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            responseJson.contextOut = responseToUser.outputContexts;
            console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
            response.json(responseJson); // Send response to Dialogflow
        }
    };
    function sendResponseFollowUp(responseToUser, followUpName) {
        // if the response is a string send it as a response to the user
        if (typeof responseToUser === 'string') {
            let responseJson = {};
            responseJson.speech = responseToUser; // spoken response
            responseJson.displayText = responseToUser; // displayed response
            responseJson.followupEvent = {
                "name": followUpName
            }
            response.json(responseJson); // Send response to Dialogflow
        } else {
            // If the response to the user includes rich responses or contexts send them to Dialogflow
            let responseJson = {};
            // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
            responseJson.speech = responseToUser.speech || responseToUser.displayText;
            responseJson.displayText = responseToUser.displayText || responseToUser.speech;
            // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
            responseJson.data = responseToUser.data;
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            responseJson.contextOut = responseToUser.outputContexts;
            console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
            response.json(responseJson); // Send response to Dialogflow
        }
    };
    //Fonctions pour se balader dans l'array products'
    function repeatProducts() {
        let myText = "Pas de probleme, je r\u00E9p\u00E8te: "
        //pas besoin de if car on l'appelle que quand on déclenche un intent qui doit obligatoirement suivre la recherche produits
        sayProducts(myText);
    }

    function nextProducts() {
        productIndex += 1;
        if (arrayProducts[productIndex]) {
            let myText = "Voici le produit suivant: ";
            sayProducts(myText);
        }
        else {
            let text = "D\u00E9sol\u00E9, c\'est tout ce que j\'ai en rayon";
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse(text);
            } else {
                sendResponse(text);
            }
        }
    }

    function previousProducts() {
        productIndex -= 1;
        if (productIndex < 0) {
            productIndex = 0;
            repeatProducts();
        }
        else {
            let myText = "Pas de probl\u00E8me, je reviens en arri\u00E8re :";
            sayProducts(myText);
        }
    }

    function sayProducts(text) {
        if (arrayProducts) {
            text = text + arrayProducts[productIndex];
            sendResponse(text);
        }
        return text;
    }

    function selectProduct(number) {
        if (number == -1) {
            console.log("c'est bieng");
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse("Tu as choisi " + arrayProductsFull[productIndex][0] + ". C'est bien cela? Si oui combien en veux-tu?");
            } else {
                sendResponse("Tu as choisi " + arrayProductsFull[productIndex][0] + ". C'est bien cela? Si oui combien en veux-tu?");
            }
            actualProduct = arrayProductsFull[productIndex];// produit actuel pour pouvoir le citer après
        } else {
            console.log("c'est pas bieng");
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse("Tu as choisi " + arrayProductsFull[number - 1][0] + ". C'est bien cela? Si oui combien en veux-tu?");
            } else {
                sendResponse("Tu as choisi " + arrayProductsFull[number - 1][0] + ". C'est bien cela? Si oui combien en veux-tu?");
            }
            actualProduct = arrayProductsFull[number - 1];// produit actuel pour pouvoir le citer après
        }
    }
}
// Construct rich response for Google Assistant (v1 requests only)
const app = new DialogflowApp();
console.log("PAR ICIIIIIIIIIII: " + JSON.stringify(app.ask));
const googleRichResponse = app.buildRichResponse()
    .addSimpleResponse('This is the first simple response for Google Assistant')
    .addSuggestions(
    ['Suggestion Chip', 'Another Suggestion Chip'])
    // Create a basic card and add it to the rich response
    .addBasicCard(app.buildBasicCard(`This is a basic card.  Text in a
 basic card can include "quotes" and most other unicode characters
 including emoji ??.  Basic cards also support some markdown
 formatting like *emphasis* or _italics_, **strong** or __bold__,
 and ***bold itallic*** or ___strong emphasis___ as well as other things
 like line  \nbreaks`) // Note the two spaces before '\n' required for a
        // line break to be rendered in the card
        .setSubtitle('This is a subtitle')
        .setTitle('Title: this is a title')
        .addButton('This is a button', 'https://assistant.google.com/')
        .setImage('https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
        'Image alternate text'))
    .addSimpleResponse({
        speech: 'This is another simple response',
        displayText: 'This is the another simple response ??'
    });
// Rich responses for Slack and Facebook for v1 webhook requests
const richResponsesV1 = {
    'slack': {
        'text': 'This is a text response for Slack.',
        'attachments': [
            {
                'title': 'Title: this is a title',
                'title_link': 'https://assistant.google.com/',
                'text': 'This is an attachment.  Text in attachments can include \'quotes\' and most other unicode characters including emoji ??.  Attachments also upport line\nbreaks.',
                'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
                'fallback': 'This is a fallback.'
            }
        ]
    },
    'facebook': {
        'attachment': {
            'type': 'template',
            'payload': {
                'template_type': 'generic',
                'elements': [
                    {
                        'title': 'Title: this is a title',
                        'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
                        'subtitle': 'This is a subtitle',
                        'default_action': {
                            'type': 'web_url',
                            'url': 'https://assistant.google.com/'
                        },
                        'buttons': [
                            {
                                'type': 'web_url',
                                'url': 'https://assistant.google.com/',
                                'title': 'This is a button'
                            }
                        ]
                    }
                ]
            }
        }
    }
};
/*
* Function to handle v2 webhook requests from Dialogflow
*/
function processV2Request(request, response) {
    // An action is a string used to identify what needs to be done in fulfillment
    let action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
    // Parameters are any entites that Dialogflow has extracted from the request.
    let parameters = request.body.queryResult.parameters || {}; // https://dialogflow.com/docs/actions-and-parameters
    // Contexts are objects used to track and store conversation state
    let inputContexts = request.body.queryResult.contexts; // https://dialogflow.com/docs/contexts
    // Get the request source (Google Assistant, Slack, API, etc)
    let requestSource = (request.body.originalDetectIntentRequest) ? request.body.originalDetectIntentRequest.source : undefined;
    // Get the session ID to differentiate calls from different users
    let session = (request.body.session) ? request.body.session : undefined;
    // Create handlers for Dialogflow actions as well as a 'default' handler
    const actionHandlers = {
        // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
        'input.welcome': () => {
            sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
        },
        // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
        'input.unknown': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
        },
        // Default handler for unknown or undefined actions
        'default': () => {
            let responseToUser = {
                //fulfillmentMessages: richResponsesV2, // Optional, uncomment to enable
                //outputContexts: [{ 'name': `${session}/contexts/weather`, 'lifespanCount': 2, 'parameters': {'city': 'Rome'} }], // Optional, uncomment to enable
                fulfillmentText: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
            };
            sendResponse(responseToUser);
        }
    };
    // If undefined or unknown action use the default handler
    if (!actionHandlers[action]) {
        action = 'default';
    }
    // Run the proper handler function to handle the request from Dialogflow
    actionHandlers[action]();
    // Function to send correctly formatted responses to Dialogflow which are then sent to the user
    function sendResponse(responseToUser) {
        // if the response is a string send it as a response to the user
        if (typeof responseToUser === 'string') {
            let responseJson = { fulfillmentText: responseToUser }; // displayed response
            response.json(responseJson); // Send response to Dialogflow
        } else {
            // If the response to the user includes rich responses or contexts send them to Dialogflow
            let responseJson = {};
            // Define the text response
            responseJson.fulfillmentText = responseToUser.fulfillmentText;
            // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
            if (responseToUser.fulfillmentMessages) {
                responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
            }
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            if (responseToUser.outputContexts) {
                responseJson.outputContexts = responseToUser.outputContexts;
            }
            // Send the response to Dialogflow
            console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
            response.json(responseJson);
        }
    }
}
const richResponseV2Card = {
    'title': 'Title: this is a title',
    'subtitle': 'This is an subtitle.  Text can include unicode characters including emoji ??.',
    'imageUri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
    'buttons': [
        {
            'text': 'This is a button',
            'postback': 'https://assistant.google.com/'
        }
    ]
};
const richResponsesV2 = [
    {
        'platform': 'ACTIONS_ON_GOOGLE',
        'simple_responses': {
            'simple_responses': [
                {
                    'text_to_speech': 'Spoken simple response',
                    'display_text': 'Displayed simple response'
                }
            ]
        }
    },
    {
        'platform': 'ACTIONS_ON_GOOGLE',
        'basic_card': {
            'title': 'Title: this is a title',
            'subtitle': 'This is an subtitle.',
            'formatted_text': 'Body text can include unicode characters including emoji ??.',
            'image': {
                'image_uri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png'
            },
            'buttons': [
                {
                    'title': 'This is a button',
                    'open_uri_action': {
                        'uri': 'https://assistant.google.com/'
                    }
                }
            ]
        }
    },
    {
        'platform': 'FACEBOOK',
        'card': richResponseV2Card
    },
    {
        'platform': 'SLACK',
        'card': richResponseV2Card
    }
];

myApp.listen(REST_PORT, () => {
    console.log('Rest service ready on port ' + REST_PORT);
});
