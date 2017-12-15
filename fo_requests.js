const request = require('request');
const express = require('express');
const FO_URL = process.env.MCO_URL;
const Other = require("./other_functions.js");

exports.addProductBasketFront= function (idProduit, cookie) {
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

exports.hitFO = function (cookie) {
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

exports.getRecapPanier= function (c) {
    var options = {
        method: 'POST',
        uri: FO_URL + "AfficherPanier",
        headers: {
            cookie: c
        }
    };
    return new Promise((resolve, reject) => {
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

exports.getAspNetSessionId= function (email, mdp) {
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

                resolve(Other.parseCookies(response.headers['set-cookie'].toString()));
            }
            else {
                console.log("getAspNetSessionId ERREUR" + error);
                reject(error);
            }
        })
    });
}

exports.getProduit = function (produit, idPdv, c) {
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
                reject(error);
            }
        })
    })
}


