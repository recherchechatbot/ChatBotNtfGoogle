'use strict';

const express = require('express');
const JSONbig = require('json-bigint');
const request=require('request');
/*const functions = require('firebase-functions');*/ // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library
//exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
//  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
//  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
//  if (request.body.result) {
//    processV1Request(request, response);
//  } else if (request.body.queryResult) {
//    processV2Request(request, response);
//  } else {
//    console.log('Invalid Request');
//    return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
//  }
//});
const REST_PORT = (process.env.PORT || 5000);
const bodyParser = require('body-parser');
const myApp = express();

//Memoire de la derniere recherche
var arrayProducts = [];//array de dim2 avec les strings qu'on veut renvoyer, coup�e tous les 5 produits'
var arrayProductsFull = [];
//Memoire du dernier groupe de 5 produits renvoy�s
var productIndex = 0;
var actualProduct = [];
//Config vars, TODO � cacher plus tard
const MCO_URL = "https://wsmcommerce.intermarche.com/";
const RC_URL = "https://api-vip-dmz.mousquetaires.com/";
const FO_URL = "https://drive.intermarche.com/";
const MSQ_APP_RC = "ecommerce";
const MSQ_JETON_APP_RC = "9206b4da-b84f-4145-8473-a7b40d5ecd56";
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

    //const userLogin = UserStore.get(username);
    //if (!userLogin || userLogin.password !== password) {
    //    res.render('authorize', {
    //        redirectURI,
    //        username,
    //        password,
    //        errorMessage: !userLogin
    //            ? 'Uh oh. That username doesn�t exist. Please use the demo account or try again.' // eslint-disable-line max-len
    //            : 'Oops. Incorrect password',
    //        errorInput: !userLogin ? 'username' : 'password',
    //    });
    //} else {
    //    linkAccountToMessenger(res, userLogin.username, redirectURI);
    //}

    var authCode = null;

    loginRC(resultat.email, resultat.mdp)
        .then((rep) => {
            console.log("REPONSE du RCCCCCCCCCCCCCC");
            console.log("Res: " + JSON.stringify(rep));
            console.log("Res.id :" + rep.id);

            if (rep.id) {
                loginMCommerce(resultat.email, resultat.mdp, rep.id)
                    .then((r) => {
                        console.log("ICIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII");
                        console.log("rrrrrrrrrrrrrrrrrrr" + JSON.stringify(r));

                        if (r.TokenAuthentification) {

                            email = resultat.email;

                            myToken = r.TokenAuthentification;
                            console.log("State dans le login: " + resultat.state);
                            console.log("le token a bien �t� r�cup�r�");
                            const redirectURISuccess = `${resultat.redirectURI}#access_token=${myToken}&token_type=bearer&state=${resultat.state}`;
                            console.log("URL DE REDIRECTION: " + redirectURISuccess);

                            console.log("on link le mco " + myToken + " avec l'email " + resultat.email);
                            

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
                                    console.log("impossible de r�cup�rer idpdvfavori, erreur suivante: " + err);
                                });
                            //On r�cup�re les cr�neaux d�s la connexion pour l'instant parce que sinon trop long apr�s (timeout maxi de 5s entre le moment ou dialogflow envoie quelque chose au webhook et ou il recoit la r�ponse, malheureusement heroku met trop de temps, TODO � CHANGER QUAND MEILLEURE SOLUTION D'HEBERGEMENT DE l'APP)'
                            getCreneaux(myToken)
                                .then((r) => {
                                    responseChoixCreneau = r;
                                    console.log("my Choix Creneau: " + JSON.stringify(responseChoixCreneau));

                                })

                            return res.json({
                                EstEnErreur: false,
                                urlRedirection: redirectURISuccess
                            });
                        }
                        else {
                            console.log("le token n'a pas �t� r�cup�r� mais la r�ponse est ok");
                            return res.json({
                                EstEnErreur: true,
                                urlRedirection: ""
                            });
                        }
                    })
            }
            else {
                console.log("Impossible de r�cuperer l'idRC");
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
    
    



    /*
      The auth code can be any thing you can use to uniquely identify a user.
      Once the redirect below happens, this bot will receive an account link
      message containing this auth code allowing us to identify the user.
      NOTE: It is considered best practice to use a unique id instead of
      something guessable like a users username so that malicious
      users cannot spoof a link.
     */
    //const authCode = uuid();

    // set the messenger id of the user to the authCode.
    // this will be replaced on successful account link
    // with the users id.

    // Redirect users to this URI on successful login

});
myApp.set('view engine', 'ejs');
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

myApp.post('/webhook', (request, response) => {

    //console.log(request);
    //console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + JSON.stringify(request.body));
    //if (request.body.result) {
    //    processV1Request(request, response);
    //} else if (request.body.queryResult) {
    //    processV2Request(request, response);
    //} else {
    //    console.log('Invalid Request');
    //    return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
    //}
    console.log("avant toute chose dans le app.post");
    var body = JSON.parse(request.body);

    console.log("On vient de definir le body");
    
    if (body) {
        console.log("avant toute chose dans le app.post");
        console.log("A priori le body existe quand on le big parse, le voici: " + JSON.stringify(body));
        processV1Request(request, response);
    } else {
        console.log('Invalid Request');
        return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
    }
});

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

function getRecette(product, token) {
    let url="https://wsmcommerce.intermarche.com/api/v1/recherche/recette?mot="+product;
    console.log("URRRRLL:" + url);
    var options={
        method:'GET',
        uri:url,

        headers:{
            'TokenAuthentification':token
        }
    };
    console.log("my Options:" + options);
        return new Promise ((resolve,reject)=>{
            request(options,(error,response)=>{
                if(!error && response.statuscode==200){
                    resolve(response.body);
                }
                else{
                    reject(error);
                }
            });
        }
        );
    
}

function getProduit(produit, idPdv, c) {
    console.log("DEBUT getProduit");
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
    console.log("FIN getProduit");
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                console.log("ON A UN RETOUR 200 !!!!!!!");
                console.log("voila le body = " + response.body);
                resolve(response.body);
            }
            else {
                console.log("ON FAIT UN REJECT");
                reject(error);
            }
        })
    })
}

function getMcoUserInfo(token) {
    console.log("et ici, on rentre?");
    var options = {
        method: 'GET',
        uri: MCO_URL + "api/v1/clientRc",
        headers: {
            'TokenAuthentification': token
        },
        json: true
    };
    console.log("myOptions" + JSON.stringify(options));
    return new Promise((resolve, reject) => {
        console.log("dans le promise");
        request(options, (error, response) => {
            console.log('dans le request');
            if (!error && response.statusCode == 200) {
                console.log('Mco user info result : ' + response.body);
                resolve(response.body);
            } else {
                console.log('Error while getting Mco user info: ' + error);
                reject(error);
            }
        });
    })
}

function getNamePdv(idPdv) {
    console.log("on est rentr�s dans getNamePdv");
    var options = {
        method: 'GET',
        uri: MCO_URL + "api/v1/pdv/fiche/" + idPdv,
        json: true
    };
    return new Promise((resolve, reject) => {
        request(options, (error, response) => {
            if (!error && response.statusCode == 200) {
                console.log('Fiche PDV ' + response.body);
                resolve(response.body);
            } else {
                console.log('Error while getting name PDV: ' + error);
                reject(error);
            }
        });
    })
}

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
            //console.log("ceci est le body lorsqu'on essaye d'ajouter un truc au panier:" + JSON.stringify(response.body));
            resolve(response.body);
        });

    });


}

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

            console.log("HIT FO OK :");
            resolve();
        });
    });
}

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
  const app = new DialogflowApp({request: request, response: response});
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
          //sendResponse("Je fonctionne mais mcommerce c'est lent");
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
                      sendGoogleResponse("Je n'ai pas r\u00E9ussi � trouver des r\u00E9sultats pour ta recherche, v\u00E9rifie que tu es bien connect\u00E9 sur ton compte");
                  } else {
                      sendResponse("Je n'ai pas r\u00E9ussi � trouver des r\u00E9sultats pour ta recherche, v\u00E9rifie que tu es bien connect\u00E9 sur ton compte");
                  }
                  console.log("ERREUR:" + err);
              })
      },
      'recherche.produit': () => {
          let myProduct = parameters.Nourriture;
          let myIdPdv = 1;
          let cookie = 'ASP.NET_SessionId=' + ASPSessionId + ';IdPdv=' + myIdPdv;

          getProduit(myProduct, myIdPdv, cookie)
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
                      if (r[i].StockEpuise==false) {
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
        if (parameters.number=1) {
            myChoice = parameters.number;
        } else {
            myChoice = -1;
        }
        selectProduct(myChoice);
        
    },
    'choix.quantite.produit': () => {
        console.log("on est bien dans le bon onglet \"action\" ")
        
        let myNumber = parameters.number;
     
        var cookieSession = 'ASP.NET_SessionId=' + ASPSessionId;
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
            .then((n) => {
                var fichePdv = n;
                if (fichePdv.Site && fichePdv.HorairesLundi && fichePdv.HoraireDimanche) {
                    var horairesSemaine = fichePdv.HorairesLundi.replace(";;;;", " \u00E0 ");
                    var horairesDim = fichePdv.HorairesDimanche.replace(";;;;", " \u00E0 ");
                    var namePdvFavori = fichePdv.Site;
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse(sexe + ' ' + nomFamille + ', ' + 'votre magasin situ\u00E9 \u00E0 ' + namePdvFavori + ' est ouvert du Lundi au Samedi de ' + horairesSemaine + ' et le Dimanche de ' + horairesDim);// Aller chercher les infos client sur l'app'
                    } else {
                        sendResponse(sexe + ' ' + nomFamille + ', ' + 'votre magasin situ\u00E9 \u00E0 ' + namePdvFavori + ' est ouvert du Lundi au Samedi de ' + horairesSemaine + ' et le Dimanche de ' + horairesDim);
                    }
                }

            })
            .catch(err => {
                console.log("Impossible de recuperer le nom du PDV");
            })
    },
    'choix.creneau': () => {
        //TO DO, s�parer si l'utilisateur met seulement un jour ou seulement une heure'
        console.log("on est dans choix creneau, voila le body dans lequel on tape: " + responseChoixCreneau);
        if (responseChoixCreneau) {
            if (parameters.date && parameters.time) {
                let heure = parameters.time.slice(0, -3);//Met heure de type 00:00:00 en format 00h00
                console.log("heure avant: " + heure);
                heure = heure.replace(":", "h");
                console.log("HEURE  APRES" + heure);
                let leni = responseChoixCreneau.Drive.CreneauxSemaine.length;
                console.log("ON A PASSE LA PREMIERE MENTION DE responseChoixCreneau, voil� leni: " + leni);
                for (var i = 0; i < leni; i++) {
                    console.log("ON RENTRE DANS LE FOR, it�ration num�ro : " + i);
                    let lenj = responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires.length;
                    console.log("voil� lenj: " + lenj);
                    for (var j = 0; j < lenj; j++) {
                        console.log("on RENTRE DANS LE DEUXIEME FOR, it�ration numero: "+ j);
                        if (responseChoixCreneau.Drive.CreneauxSemaine[i].HeureDebut == heure) {
                            console.log("ON RENTRE DANS LE PREMIER IF");
                            if (responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires[j].DateCreneau.startsWith(parameters.date)) {
                                console.log("ON RENTRE DANS LE DEUXIEME IF");
                                if (responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires[j].Statut == "disponible") {
                                    console.log("ON RENTRE DANS LE TROISIEME IF");
                                    myIdCreneau = responseChoixCreneau.Drive.CreneauxSemaine[i].CreneauxHoraires[j].IdCreneau;
                                    console.log("Voici mi ID CRENEAU: " + myIdCreneau);
                                    if (requestSource === googleAssistantRequest) {
                                        sendGoogleResponse("C'est not\u00E9, tu pourras donc aller chercher ta commande \u00E0 ce moment l\u00E0");//TODO annulation & recap date et heure
                                    } else {
                                        sendResponse("C'est not\u00E9, tu pourras donc aller chercher ta commande \u00E0 ce moment l\u00E0");
                                    }
                                }
                                else {
                                    if (requestSource === googleAssistantRequest) {
                                        sendGoogleResponse("Malheureusement " + userInfos.AdresseDeFacturation.Prenom + ", ton cr\u00E9neau n'est pas disponible, je te prie donc d'en choisir un autre");//TODO annulation & recap date et heure
                                    } else {
                                        sendResponseFollowUp("Malheureusement " + userInfos.AdresseDeFacturation.Prenom + ", ton cr\u00E9neau n'est pas disponible, je te prie donc d'en choisir un autre");
                                    }
                                }
                            }
                        }
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
  function sendGoogleResponse (responseToUser) {
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
  function sendResponse (responseToUser) {
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
  function sendResponseFollowUp(responseToUser,followUpName) {
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
  function repeatProducts() {
      let myText = "Pas de probleme, je r\u00E9p\u00E8te: "
      //pas besoin de if car on l'appelle que quand on d�clenche un intent qui doit obligatoirement suivre la recherche produits
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
      //actualProduct = arrayProductsFull[(number - 1)];// produit actuel pour pouvoir le citer apr�s
      if (number == -1) {
          if (requestSource === googleAssistantRequest) {
              sendGoogleResponse("Tu as choisi " + arrayProductsFull[productIndex][0] + ". C'est bien cela? Si oui combien en veux-tu?");
          } else {
              sendResponse("Tu as choisi " + arrayProductsFull[productIndex][0] + ". C'est bien cela? Si oui combien en veux-tu?");
          }
          actualProduct = arrayProductsFull[productIndex];// produit actuel pour pouvoir le citer apr�s
      } else {
          if (requestSource === googleAssistantRequest) {
              sendGoogleResponse("Tu as choisi " + arrayProductsFull[number - 1][0] + ". C'est bien cela? Si oui combien en veux-tu?");
          } else {
              sendResponse("Tu as choisi " + arrayProductsFull[number - 1][0] + ". C'est bien cela? Si oui combien en veux-tu?");
          }
          actualProduct = arrayProductsFull[number - 1];// produit actuel pour pouvoir le citer apr�s
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
* Function to handle v2 webhook requests from Dialogflow
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
    //    getRecette('poulet','32e88d45-0f1a-4d39-b35b-a8469da5ad10')
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

