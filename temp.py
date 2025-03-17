import tensorflow as tf
import tensorflowjs as tfjs

# Load your Keras model
model = tf.keras.models.load_model("/Users/harshwardhan/Desktop/mfa_A18/model.h5")

# Convert and save the model to TensorFlow.js format in the target directory
tfjs.converters.save_keras_model(model, "/Users/harshwardhan/Desktop/mfa_A18/public/models/antispoof_model")
print("Conversion complete.")
