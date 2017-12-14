﻿'use strict';

const express = require('express');
const JSONbig = require('json-bigint');
const request=require('request');
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library
const REST_PORT = (process.env.PORT || 5000);
const bodyParser = require('body-parser');
const myApp = express();

//Import modules
const Mco = require("./mco_requests");
console.log("Mco: " + JSON.stringify(Mco));
const Fo = require('./fo_requests');
console.log("Fo: " + JSON.stringify(Fo));
const Rc = require("./rc_requests");
console.log("Rc: " + JSON.stringify(Rc));
const Other = require("./other_functions.js");

//Global Vars
    //Memoire de la derniere recherche
var arrayProducts = [];//array  avec le string qu'on veut renvoyer'
var arrayProductsFull = [];//array de dimension 2: arrayProductsFull=[[r[i].Libelle, r[i].IdProduit]]
var productIndex = 0;//curseur pour passer au produit suivant ou à celui d'avant'
var actualProduct = [];//Produit actuel
    //Vars authentification
var email = "";
var mdp = "";
var myToken = "";
var ASPSessionId = "";
var userInfos = {};
var myIdCreneau = 0;

//Config vars, sont dans les configs d'heroku (dans settings->config vars)'
const MCO_URL = process.env.MCO_URL;
const RC_URL = process.env.RC_URL;
const FO_URL = process.env.FO_URL;
const MSQ_APP_RC = process.env.MSQ_APP_RC;
const MSQ_JETON_APP_RC = process.env.MSQ_JETON_APP_RC;

myApp.use(bodyParser.text({ type: 'application/json' }));
//Process lancé quand l'utilisateur a rentré ses identifiants'
myApp.post('/login', function (req, res) {
    var resultat = JSONbig.parse(req.body);
    console.log("VALEUR DE BODY : " + JSON.stringify(req.body));
    var authCode = null;
    Rc.loginRC(resultat.email, resultat.mdp)
        .then((rep) => {
            console.log("Res: " + JSON.stringify(rep));
            if (rep.id) {
                Mco.loginMCommerce(resultat.email, resultat.mdp, rep.id)
                    .then((r) => {
                        if (r.TokenAuthentification) {
                            console.log("le token a bien été récupéré");
                            email = resultat.email;
                            myToken = r.TokenAuthentification;
                            const redirectURISuccess = `${resultat.redirectURI}#access_token=${myToken}&token_type=bearer&state=${resultat.state}`;
                            getAspNetSessionId(resultat.email, resultat.mdp)
                                .then((c) => {
                                    ASPSessionId = c["ASP.NET_SessionId"]
                                })
                                .catch(err => {
                                    console.log("impossible de recuperer session id ASP");
                                });
                            Mco.getMcoUserInfo(myToken)
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
//Set page html connexion sur le google home
myApp.set('view engine', 'ejs');
//Page de connexion, utilise OAuth 2 
myApp.get('/authorize', function (req, res) {
    var accountLinkingToken = req.query.account_linking_token;
    var redirectURI = req.query.redirect_uri;
    var state = req.query.state;
    console.log("STATE: " + state);
    // Redirect users to this URI on successful login
    res.render('authorize', {
        accountLinkingToken: accountLinkingToken,
        redirectURI: redirectURI,
        state:state
    });
});
//Webhook (échange dialogflow-appli par POST)
myApp.post('/webhook', (request, response) => {
    var body = JSON.parse(request.body);
    if (body) {
        processV1Request(request, response);//Toujours en V1, dialogflow va passer progressivement en V2 (beta pour l'instant), il faudra changer à ce moment là
    } else {
        console.log('Invalid Request');
        return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
    }
});

/*
   * Function qui gère les requêtes de type V1 de la part de dialogflow
   */
function processV1Request(request, response) {
    var body = JSON.parse(request.body);
    let action = body.result.action; // https://dialogflow.com/docs/actions-and-parameters
    let parameters = body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters
    let inputContexts = body.result.contexts; // https://dialogflow.com/docs/contexts
    let requestSource = (body.originalRequest) ? body.originalRequest.source : undefined;
    const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests
    const app = new DialogflowApp({ request: request, response: response });
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
                sendGoogleResponse('Je suis désolé ' + userInfos.AdresseDeFacturation.Prenom + ', mais je n\'ai pas compris ta requête, peux-tu essayer de la reformuler différement s\'il te plaît?');
            } else {
                sendResponse('Je suis désolé ' + userInfos.AdresseDeFacturation.Prenom + ', mais je n\'ai pas compris ta requête, peux-tu essayer de la reformuler différement s\'il te plaît?');
            }
        },
        //Marche pas car timeout trop long
        'recherche.recette': () => {
            let myText = 'Voici quelques recettes pour toi: ';
            Mco.getRecette('poulet', myToken)
                .then((r) => {
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
            let myProduct = parameters.Nourriture;
            let myIdPdv = 1;
            let cookie = 'ASP.NET_SessionId=' + ASPSessionId + ';IdPdv=' + myIdPdv;
            Fo.getProduit(myProduct, myIdPdv, cookie)
                .then((r) => {
                    arrayProducts = [];
                    arrayProductsFull = []
                    //Version avec 4 produits:
                    //  let arrayTemp = [];
                    //  let myText = 'Voici les produits que je peux te proposer: ';
                    //  for (var i = 0; i < r.length; i++) {
                    //      if (arrayTemp.length == 4 && sayProducts(myText).length < 640) {
                    //          arrayProducts.push(arrayTemp);
                    //          arrayTemp = [];
                    //          arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                    //          arrayProductsFull.push([r[i].Libelle, r[i].IdProduit]);
                    //      }
                    //      else if (arrayTemp.length == 4 && sayProducts(myText).length >= 640) {
                    //          let popped = arrayTemps.pop();
                    //          arrayProducts.push(arrayTemp);
                    //          arrayTemp = [popped];
                    //          arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                    //          arrayProductsFull.push([r[i].Libelle, r[i].IdProduit]);
                    //      }
                    //      else {                          
                    //          if (i == (r.length - 1) && arrayTemp.length < 3) {
                    //            arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                    //            arrayProducts.push(arrayTemp);
                    //            arrayProductsFull.push([r[i].Libelle, r[i].IdProduit]);
                    //        }
                    //          else {
                    //              arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                    //              arrayProductsFull.push([r[i].Libelle, r[i].IdProduit]);
                    //        }
                    //    }
                    //}
                    var myText = "Je peux te proposer: ";
                    for (var i = 0; i < r.length; i++) {
                        if (r[i].StockEpuise == false) {
                            arrayProducts.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                            arrayProductsFull.push([r[i].Libelle, r[i].IdProduit]);
                        }
                    }
                    sayProducts(myText);
                    productIndex = 0;
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
            let myChoice = 0;
            if (parameters.number = 1) {
                myChoice = parameters.number;
            } else {
                myChoice = -1;
            }
            selectProduct(myChoice);
        },
        'choix.quantite.produit': () => {
            let myNumber = parameters.number;
            var cookieSession = 'ASP.NET_SessionId=' + ASPSessionId;
            for (var i = 0; i < myNumber; i++) {
                Fo.hitFO(cookieSession)
                    .then(() => {
                        Fo.addProductBasketFront(actualProduct[1], cookieSession)
                            .then((r) => {
                                if (requestSource === googleAssistantRequest) {
                                    sendGoogleResponse('\u00C7a marche, j\'ai ajout\u00E9 ' + myNumber + ' ' + actualProduct[0] + ' \u00E0 ton panier');
                                } else {
                                    sendResponse('\u00C7a marche, j\'ai ajout\u00E9 ' + myNumber + ' ' + actualProduct[0] + ' \u00E0 ton panier');
                                }
                            })
                    })
            }
        },
        'horaires.pdv': () => {
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
            Mco.getNamePdv(idPdvFavori)
                .then((fichePdv) => {
                    if (fichePdv.Site && fichePdv.HorairesLundi && fichePdv.HorairesDimanche) {
                        var horairesSemaine = fichePdv.HorairesLundi.replace(/\;/g, "");
                        var horairesSemaineOuverture = horairesSemaine.slice(0, 5);
                        var horairesSemaineFermeture = horairesSemaine.slice(-5);//TODO PEUT ETRE SEPARER LE SAMEDI?
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
        //TODO, faire une vraie reservation de créneau (avec annulation si necessaire), gérer les autres modes de retrait (uniquement le drive pour l'instant'), faire quelque chose si l'utilisateur met seulement un jour ou seulement une heure'
        'choix.creneau': () => {
            Mco.getCreneaux(myToken)
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
                                                    sendGoogleResponse("C'est not\u00E9, tu pourras donc aller chercher ta commande le " + dateCreneau.slice(8, 10) + " " + Other.getMonth(dateCreneau.slice(5, 7)) + " entre " + responseChoixCreneau.Drive.CreneauxSemaine[i].HeureDebut + " et " + responseChoixCreneau.Drive.CreneauxSemaine[i].HeureFin);//TODO annulation & recap date et heure
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
                                            console.log("PROBLEME DE COMPARAISON DE DATE");
                                        }
                                    }
                                } else {
                                    console.log("PROBLEME DE COMPARAISON DHEURE");
                                }
                            }
                        }
                    }
                    else {
                        if (requestSource === googleAssistantRequest) {
                            sendGoogleResponse("Oups, je n'ai pas r\u00E9ussi");
                        } else {
                            sendResponseFollowUp("Oups, je n'ai pas r\u00E9ussi");
                        }
                    }
                })
        },
        'montant.panier': () => {
            var cookieSession = 'ASP.NET_SessionId=' + ASPSessionId;
            Fo.hitFO(cookieSession)
                .then(() => {
                    Fo.getRecapPanier(cookieSession)
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
            Mco.emptyBasket(myToken)
                .then((r) => {
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse("Ton panier a bien été vidé");
                    } else {
                        sendResponse("Ton panier a bien été vidé");
                    }
                })
        },
        // Default handler for unknown or undefined actions
        'default': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            if (requestSource === googleAssistantRequest) {
                let responseToUser = {
                    //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
                    //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
                    speech: 'Oups, il y a eu un problème, peux-tu réessayer s\'il te plaît?', // spoken response
                    text: 'Oups, il y a eu un problème, peux-tu réessayer s\'il te plaît?' // displayed response
                };
                sendGoogleResponse(responseToUser);
            } else {
                let responseToUser = {
                    //data: richResponsesV1, // Optional, uncomment to enable
                    //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
                    speech: 'Oups, il y a eu un problème, peux-tu réessayer s\'il te plaît?', // spoken response
                    text: 'Oups, il y a eu un problème, peux-tu réessayer s\'il te plaît?' // displayed response
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

    function repeatProducts() {
        let myText = "Pas de probleme, je r\u00E9p\u00E8te: "
        //pas besoin de if car on l'appelle que quand on déclenche un intent qui doit obligatoirement suivre la recherche produits
        sayProducts(myText);
    }

    function nextProducts() {
        productIndex += 1;
        if (arrayProducts[productIndex]) {
            //Version 4 produits
            //let myText = "Voici les produits suivants: ";
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
        //Version 4 produits
        //if (arrayProducts[productIndex]) {
        //    for (var i = 0; i < arrayProducts[productIndex].length; i++) {
        //        text = text + arrayProducts[productIndex][i];
        //    }
        //    if (requestSource === googleAssistantRequest) {
        //        sendGoogleResponse(text);
        //    } else {
        //        sendResponse(text);
        //    }
        //}
        if (arrayProducts) {
            text = text + arrayProducts[productIndex];
            sendResponse(text);
        }
        return text;
    }

    function selectProduct(number) {
        //Version 4 produits
        //if (requestSource === googleAssistantRequest) {
        //    sendGoogleResponse("Tu as choisi le num\u00E9ro: " + arrayProductsFull[(number - 1)][0] + ". C'est bien cela? Si oui combien en veux-tu?");
        //} else {
        //    sendResponse("Tu as choisi le num\u00E9ro: " + arrayProductsFull[(number - 1)][0] + ". C'est bien cela? Si oui combien en veux-tu?");
        //}
        //actualProduct = arrayProductsFull[(number - 1)];// produit actuel pour pouvoir le citer après
        if (number == -1) {
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse("Tu as choisi " + arrayProductsFull[productIndex][0] + ". C'est bien cela? Si oui combien en veux-tu?");
            } else {
                sendResponse("Tu as choisi " + arrayProductsFull[productIndex][0] + ". C'est bien cela? Si oui combien en veux-tu?");
            }
            actualProduct = arrayProductsFull[productIndex];// produit actuel pour pouvoir le citer après
        } else {
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
  .addSimpleResponse({ speech: 'This is another simple response',
    displayText: 'This is the another simple response ??' });
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
* Template pour gerer les requêtes V2 à terme
*/
function processV2Request (request, response) {
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
    //'recherche.recette':()=>{
    //    let myText='Voici quelques recettes pour toi: ';
    //    console.log("myText:"+ myText);
    //    Mco.getRecette('poulet','32e88d45-0f1a-4d39-b35b-a8469da5ad10')
    //    .then((r)=>{
    //        let listeRecettes=JSON.parse(r);
    //        let len=listeRecettes.Recettes.length;
    //        for (var i=0;i<len;i++){
    //            myText=myText + listeRecettes.Recettes[i].Titre + ' ';
    //        }
    //        sendResponse(myText);
    //    });
        
    //},
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
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {fulfillmentText: responseToUser}; // displayed response
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

