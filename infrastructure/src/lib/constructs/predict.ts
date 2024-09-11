import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

interface PredictConstructProps extends cdk.StackProps {
  api: appsync.GraphqlApi;
  table: dynamodb.Table;
  bucket: s3.Bucket;
  speechSecretArn?: string;
}

export class PredictConstruct extends Construct {
  readonly predictAsyncLambda: NodejsFunction;

  constructor(scope: Construct, id: string, props: PredictConstructProps) {
    super(scope, id);

    const { bucket, table, api, speechSecretArn } = props;


    // Gets Secret from Secrets Manager
    let speechSecret;
    if (speechSecretArn) {
      speechSecret = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        'SpeechSecret',
        speechSecretArn
      );
    }

    // Predict Async Lambda
    this.predictAsyncLambda = new NodejsFunction(this, 'PredictAsync', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../lambdas/predict-async/index.ts'),
      environment: {
        GRAPHQL_URL: api.graphqlUrl,
        SPEECH_SECRET: speechSecretArn || '',
        S3_BUCKET: bucket.bucketName,
        TABLE_NAME: table.tableName
      },
      bundling: {
        nodeModules: ['langchain'],
        minify: true,
        sourceMap: true
      },
      memorySize: 756,
      timeout: cdk.Duration.seconds(60),
      role: new iam.Role(this, 'PredictAsyncRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'
          )
        ]
      }),
      initialPolicy: [
        // Allow the lambda to call AppSync
        new iam.PolicyStatement({
          resources: [`${api.arn}/*`],
          actions: ['appsync:GraphQL']
        }),

        // Allow the lambda to use Bedrock:InvokeModel
        // so we can call the model endpoint.
        new iam.PolicyStatement({
          resources: ['*'],
          actions: [
            'bedrock:InvokeModel*'
          ]
        }),
      ],
      tracing: Tracing.ACTIVE
    });

    // Grant read/write data access to the DynamoDB table for the Lambda
    table.grantReadWriteData(this.predictAsyncLambda);

    // Grant read access to the speech secret for the predictAsyncLambda and voiceLambda
    speechSecret?.grantRead(this.predictAsyncLambda);

    // Grant read/write access to the S3 bucket for the voiceLambda and predictAsyncLambda
    bucket.grantReadWrite(this.predictAsyncLambda, 'audio/*');
  }
}
