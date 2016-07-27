'use strict';


const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const passport = require('passport');
//const gcal     = require('google-calendar');
const config   = require('../../config')();


passport.use(new GoogleStrategy({
        clientID: config.oauth.google.key,
        clientSecret: config.oauth.google.secret,
        callbackURL: "http://elbeuf.rosanbo.com/rest/user/googlecalendar/callback",
        scope: ['openid', 'email', 'https://www.googleapis.com/auth/calendar']
    },
    function(accessToken, refreshToken, profile, done) {
        profile.accessToken = accessToken;
        return done(null, profile);
    }
));




/**
 * First click. call the google interface
 */
exports.login = passport.authenticate('google', { session: false });

/**
 * Google reply on this callback
 */
exports.callback = passport.authenticate('google', { session: false, failureRedirect: '#/user/settings/calendar' });

/**
 * This is the next function of the callback route
 * @param {object}   req [[Description]]
 * @param {object}   res [[Description]]
 */
exports.next = (req, res) => {
    console.log('accessToken: '+req.user.accessToken);
    res.redirect('#/user/settings/calendar');
};

