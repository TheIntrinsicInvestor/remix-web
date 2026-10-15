// Required entry point; the literal string "shareExtension" (not the
// component name) is what the native side looks for.
import { AppRegistry } from 'react-native';
import ShareExtension from './src/ShareExtension';

AppRegistry.registerComponent('shareExtension', () => ShareExtension);
