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
var arrayProducts = [];
//Memoire du dernier groupe de 5 produits renvoyés
var productIndex = 0;

myApp.use(bodyParser.text({ type: 'application/json' }));
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

function getRecette(product,token){
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
              sendGoogleResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
          } else {
              sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
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
          getRecette('poulet', '32e88d45-0f1a-4d39-b35b-a8469da5ad10')
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
                      sendGoogleResponse("Je n'ai pas réussi à trouver des résultats pour ta recherche, vérifie que tu es bien connecté sur ton compte");
                  } else {
                      sendResponse("Je n'ai pas réussi à trouver des résultats pour ta recherche, vérifie que tu es bien connecté sur ton compte");
                  }
                  console.log("ERREUR:" + err);
              })
      },
      'recherche.produit': () => {
          let myProduct = parameters.Nourriture;
          let myIdPdv = 1;
          let cookie = 'ASP.NET_SessionId=nzhapp2btrogfnrgp0xko4cf' + ';IdPdv=' + myIdPdv;

          getProduit(myProduct, myIdPdv, cookie)
              .then((r) => {
                  arrayProducts = [];
                  let arrayTemp = [];
                  let myText = 'Voici les produits que je peux te proposer: ';
                  for (var i = 0; i < r.length; i++) {
                      if (arrayTemp.length == 4 && sayProducts(myText).length < 640) {
                          arrayProducts.push(arrayTemp);
                          arrayTemp = [];
                          arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                      }
                      else if (arrayTemp.length == 4 && sayProducts(myText).length >= 640) {
                          let popped = arrayTemps.pop();
                          arrayProducts.push(arrayTemp);
                          arrayTemp = [popped];
                          arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                      }
                      else {
                          console.log("dans le else");
                          if (i == (r.length - 1) && arrayTemp.length < 3) {
                            arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                            arrayProducts.push(arrayTemp);
                        }
                          else {
                            arrayTemp.push(' \n' + (i + 1) + ') ' + r[i].Libelle + ' ' + r[i].Marque + ', ' + r[i].Prix + ' ' + r[i].Conditionnement + ', ');
                        }
                    }
                }
                sayProducts(myText);
            })
            .catch((err) => {
                if (requestSource === googleAssistantRequest) {
                    sendGoogleResponse("Je n'ai pas réussi à trouver des résultats pour ta recherche, vérifie que tu es bien connecté sur ton compte");
                } else {
                    sendResponse("Je n'ai pas réussi à trouver des résultats pour ta recherche, vérifie que tu es bien connecté sur ton compte");
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
  function repeatProducts() {
      let myText = "Pas de probleme, je répète: "
      //pas besoin de if car on l'appelle que quand on déclenche un intent qui doit obligatoirement suivre la recherche produits
      sayProducts(myText);
  }

  function nextProducts() {
      productIndex += 1;
      if (arrayProducts[productIndex]) {
          let myText = "Voici les produits suivants: ";
          sayProducts(myText);
      }
      else {
          let text = "Désolé, c'est tout ce que j'ai en rayon";
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
          let myText = "Pas de problème, je reviens en arrière :";
          sayProducts(myText);
      }
  }

  function sayProducts(text) {
      if (arrayProducts[productIndex]) {
          for (var i = 0; i < arrayProducts[productIndex].length; i++) {
              text = text + arrayProducts[productIndex][i];
          }

          if (requestSource === googleAssistantRequest) {
              sendGoogleResponse(text);
          } else {
              sendResponse(text);
          }
          return text;
      } else {
          return text;
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
    'recherche.recette':()=>{
        let myText='Voici quelques recettes pour toi: ';
        console.log("myText:"+ myText);
        getRecette('poulet','32e88d45-0f1a-4d39-b35b-a8469da5ad10')
        .then((r)=>{
            let listeRecettes=JSON.parse(r);
            let len=listeRecettes.Recettes.length;
            for (var i=0;i<len;i++){
                myText=myText + listeRecettes.Recettes[i].Titre + ' ';
            }
            sendResponse(myText);
        });
        
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

