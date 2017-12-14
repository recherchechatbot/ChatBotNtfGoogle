const request = require('request');
const express = require('express');
const RC_URL = process.env.MCO_URL;

class Rc {
    loginRC(email, mdp) {
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
}

const RC_REQUESTS = new Rc();
module.exports = RC_REQUESTS;