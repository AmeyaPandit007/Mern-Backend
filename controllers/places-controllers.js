const HttpError = require("../models/http-error");
const { v4: uuidv4 } = require("uuid");

const fs = require('fs');

const { validationResult } = require("express-validator");

const getCoordsForAddress = require("../util/location");

const Place = require('../models/place');

// Interaction with User
const User = require('../models/user');
const { default: mongoose } = require("mongoose");

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid; // { pid: 'p1'}

  let place;
  try {
    place = await Place.findById(placeId);
  } 
  catch (err) {
    const error = new HttpError('Something went Wrong,could not find a place',500);
    return next(error);
  }
  
  // const place = DUMMY_PLACES.find((p) => {
  //   return p.id === placeId;
  // });

  if (!place) {
    const error = new HttpError("Could not find a place for the Provided id.", 404);
    return next(error);
  }

  res.json({ place: place.toObject({ getters: true }) });
};

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;

  // const places = DUMMY_PLACES.filter((p) => {
  //   return p.creator === userId;
  // });

  // let places;
  let userWithPlaces
  try {
    userWithPlaces = await User.findById(userId).populate('places');
  } 
  catch (err) {
    const error = new HttpError(
      'Fetching places failed, please try again later.',
      500
    );
    return next(error);
  }
  // try {
  //   places = await Place.find({ creator: userId });
  // } 
  // catch (err) {
  //   const error = new HttpError('Something went Wrong,could not find a place',500);
  //   return next(error);
  // }
  
  if (!userWithPlaces || userWithPlaces.places.length === 0) {
    return next(
      new HttpError("Could not find a places for the Provided User id.", 404)
    );
  }

  res.json({ places: userWithPlaces.places.map(place => place.toObject({ getters: true })) });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  console.log(errors);

  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs passed,please check your data.", 422));
  }

  const { title, description, address } = req.body; // Object De-structuring

  let coordinates;
  try {
    coordinates = await getCoordsForAddress(address);
  } 
  catch (error) {
    return next(error);
  }

  const createdPlace = new Place({
    title,
    description,
    address,
    location: coordinates,
    image: req.file.path,
    creator: req.userData.userId
  });

  let user;

  try {
    user = await User.findById(req.userData.userId);
  } 
  catch (err) {
    const error = new HttpError(
      'Cannot find the user, please try again',
      500
    )
    return next(error);
  }

  // Non existing user cannot create place.
  if(!user) {
    const error = new HttpError(
      'Could not find user for provided id',
      404
    );
    return next(error);
  }

  console.log(user);

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();

    await createdPlace.save({ session: sess });
    user.places.push(createdPlace); 

    await user.save({ session: sess });

    await sess.commitTransaction();
  }
  catch (err) {
    const error = new HttpError(
      'Creating place failed,please try again',
      500
    )
    return next(error);
  }

  // const createdPlace = {
  //   id: uuidv4(),
  //   title: title,
  //   description: description,
  //   location: coordinates,
  //   address: address,
  //   creator: creator,
  // };

  // DUMMY_PLACES.push(createdPlace); // Unshift(createPlace);

  res.status(201).json({ place : createdPlace});
};

// Need Correction
const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422)
    );
  }

  const { title, description } = req.body;
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      'Something went wrong, could not update place.',
      500
    );
    return next(error);
  }

  if(place.creator.toString() !== req.userData.userId) {
    const error = new HttpError(
      'You are not allowed to edit this place.',
      401
    );
    return next(error);
  }

  place.title = title;
  place.description = description;

  try {
    await place.save();
  } catch (err) {
    const error = new HttpError(
      'Something went wrong, could not update place.',
      500
    );
    return next(error);
  }

  res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  // try {
  //   place = await Place.findByIdAndDelete({_id: placeId})
  // } 
  // catch (err) {
  //   const error = new HttpError(
  //     'Something went wrong.Could not delete Place.',
  //     500
  //   )
  //   return next(error);
  // }
  try {
    place = await Place.findById(placeId).populate('creator');
  } 
  catch (err) {
    const error = new HttpError(
      'Something went wrong.Could not delete Place.',
      500
    )
    return next(error);
  }

  if(!place) {
    const error = new HttpError(
      'Could not find place for this id,',
      404
    );
    return next(error);
  }

  if(place.creator.id !== req.userData.userId) {
    const error = new HttpError(
      'You are not allowed to delete this place.',
      403
    );
    return next(error);
  }

  const imagePath = place.image;

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();

    await place.remove({ session: sess });
    place.creator.places.pull(place);

    await place.creator.save({ session: sess });
    await sess.commitTransaction();
  } 
  catch (err) {
    const error = new HttpError(
      'Something went wrong.Could not delete Place.',
      500
    )
    return next(error);
  }

  fs.unlink(imagePath,(err) => {
    console.log(err);
  });

  // if(!DUMMY_PLACES.find(p => p.id === placeId)) {
  //   throw new HttpError('Could not find a place for that id',404);
  // }

  // DUMMY_PLACES = DUMMY_PLACES.filter((p) => {
  //   return p.id !== placeId;
  // });

  res.status(200).json({ message: "Deleted place..!" });
};

module.exports = [
  getPlaceById,
  getPlacesByUserId,
  createPlace,
  updatePlace,
  deletePlace,
];
